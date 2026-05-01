import { useEffect, useState, useCallback } from 'react';
import { Smartphone, Monitor, Trash2, RefreshCw, Copy, Check, Wifi, WifiOff, Plus, Server, RotateCcw } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      getConfig: () => Promise<{ serverUrl: string; deviceName: string; autoStart: boolean; signalingToken?: string; connectionMode?: string }>;
      setConfig: (data: Record<string, unknown>) => Promise<boolean>;
      getDeviceStatus: () => Promise<string>;
      onStatusChange: (cb: (s: string) => void) => () => void;
      syncLocalToken?: (token: string) => Promise<void>;
      openExternal?: (url: string) => void;
    };
  }
}

const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);

type Device = {
  id: string;
  name: string;
  platform: string;
  is_online: number;
  last_seen: string;
  created_at: string;
};

function platformIcon(platform: string) {
  return platform === 'mobile' || platform === 'ios' || platform === 'android'
    ? Smartphone
    : Monitor;
}

export default function DevicesTab() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairExpiry, setPairExpiry] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Electron config state
  const [signalingStatus, setSignalingStatus] = useState<string>('disconnected');
  const [serverUrl, setServerUrl] = useState('');
  const [deviceName, setDeviceName] = useState('');
  // Signaling server login
  const [signalingUsername, setSignalingUsername] = useState('');
  const [signalingPassword, setSignalingPassword] = useState('');
  const [signalingLoginLoading, setSignalingLoginLoading] = useState(false);
  const [signalingLoginError, setSignalingLoginError] = useState('');
  const [hasSignalingToken, setHasSignalingToken] = useState(false);

  const token = localStorage.getItem('auth-token') ?? '';

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/devices', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices ?? []);
      }
    } catch (e) {
      console.error('[Devices] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Electron: load config + subscribe to signaling status
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    window.electronAPI.getConfig().then((cfg) => {
      setServerUrl(cfg.serverUrl ?? '');
      setDeviceName(cfg.deviceName ?? '');
      setHasSignalingToken(Boolean(cfg.signalingToken));
    });
    window.electronAPI.getDeviceStatus().then(setSignalingStatus);
    const unsub = window.electronAPI.onStatusChange(setSignalingStatus);
    return unsub;
  }, []);

  const loginToSignalingServer = async () => {
    if (!window.electronAPI || !serverUrl || !signalingUsername || !signalingPassword) return;
    setSignalingLoginLoading(true);
    setSignalingLoginError('');
    try {
      // Try login first
      let res = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: signalingUsername, password: signalingPassword }),
      });
      // If login fails (user doesn't exist), auto-register
      if (!res.ok) {
        const loginErr = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          // Try to register on the remote signaling server
          const regRes = await fetch(`${serverUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: signalingUsername, password: signalingPassword }),
          });
          if (regRes.ok) {
            res = regRes;
          } else {
            const regErr = await regRes.json().catch(() => ({}));
            setSignalingLoginError(regErr.error ?? loginErr.error ?? '登录或注册失败');
            setSignalingLoginLoading(false);
            return;
          }
        } else {
          setSignalingLoginError(loginErr.error ?? '服务器错误，请稍后重试');
          setSignalingLoginLoading(false);
          return;
        }
      }
      const data = await res.json();
      const t = data.token;
      if (!t) { setSignalingLoginError('未获取到 token，请重试'); setSignalingLoginLoading(false); return; }
      await window.electronAPI.setConfig({ signalingToken: t, serverUrl, deviceName });
      setHasSignalingToken(true);
      setSignalingPassword('');
    } catch (e) {
      setSignalingLoginError('网络错误，请检查服务器地址');
    } finally {
      setSignalingLoginLoading(false);
    }
  };

  const disconnectSignaling = async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.setConfig({ signalingToken: '' });
    setHasSignalingToken(false);
  };

  // Countdown for pair code expiry
  useEffect(() => {
    if (pairExpiry <= 0) return;
    const t = setInterval(() => {
      setPairExpiry(prev => {
        if (prev <= 1) { setPairCode(null); clearInterval(t); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pairExpiry]);

  const generatePairCode = async () => {
    try {
      const res = await fetch('/api/devices/pair', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPairCode(data.code);
        setPairExpiry(data.expires_in);
      }
    } catch (e) {
      console.error('[Devices] pair error', e);
    }
  };

  const deleteDevice = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/devices/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDevices(prev => prev.filter(d => d.id !== id));
    } catch (e) {
      console.error('[Devices] delete error', e);
    } finally {
      setDeletingId(null);
    }
  };

  const copyCode = () => {
    if (!pairCode) return;
    navigator.clipboard.writeText(pairCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onlineCount = devices.filter(d => d.is_online).length;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-medium text-foreground">远程设备管理</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          管理可远程控制本机 Claude CLI 的设备。通过配对码将手机与本机绑定。
        </p>
      </div>

      {/* Electron-only: remote server config */}
      {isElectron && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-foreground flex items-center gap-2">
              <Server className="h-4 w-4" />
              远程服务器配置
            </h4>
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              signalingStatus === 'connected' || signalingStatus === 'p2p-active'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : signalingStatus === 'error'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-muted text-muted-foreground'
            }`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {{ connected: '已连接', 'p2p-active': 'P2P 活跃', error: '连接错误', disconnected: '未连接', stopped: '已停止' }[signalingStatus] ?? signalingStatus}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            配置远程 VPS 信令服务器地址，手机端通过该服务器与本机建立 P2P 连接。
            开发测试时可使用本机服务器。
          </p>
          {/* Server URL + device name (collapsed when already connected) */}
          {!hasSignalingToken && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">信令服务器地址</label>
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://cloudcli-server.onrender.com"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setServerUrl('https://cloudcli-server.onrender.com')} className="text-xs text-primary hover:underline">Render 服务器</button>
                  <span className="text-xs text-muted-foreground">|</span>
                  <button type="button" onClick={() => setServerUrl(`${location.protocol}//${location.host}`)} className="text-xs text-primary hover:underline">本机地址</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">设备名称</label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="我的电脑"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          )}

          {/* Signaling server login */}
          {hasSignalingToken ? (
            <div className="flex items-center justify-between rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
              <span className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                <Wifi className="h-4 w-4" /> 已登录信令服务器，可接受手机连接
              </span>
              <button type="button" onClick={disconnectSignaling} className="text-xs text-red-500 hover:underline">断开</button>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-dashed border-border p-3">
              <p className="text-xs text-muted-foreground">登录信令服务器后，手机可通过相同账号发现并连接此设备。首次登录将自动注册账号。</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={signalingUsername}
                  onChange={(e) => setSignalingUsername(e.target.value)}
                  placeholder="用户名"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <input
                  type="password"
                  value={signalingPassword}
                  onChange={(e) => setSignalingPassword(e.target.value)}
                  placeholder="密码"
                  onKeyDown={(e) => e.key === 'Enter' && loginToSignalingServer()}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {signalingLoginError && <p className="text-xs text-red-500">{signalingLoginError}</p>}
              <button
                type="button"
                disabled={signalingLoginLoading || !signalingUsername || !signalingPassword}
                onClick={loginToSignalingServer}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {signalingLoginLoading
                  ? <><RotateCcw className="h-4 w-4 animate-spin" />连接中…</>
                  : <><Wifi className="h-4 w-4" />登录并连接信令服务器</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pair code generator */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h4 className="font-medium text-foreground flex items-center gap-2">
          <Plus className="h-4 w-4" />
          添加新设备
        </h4>
        <p className="text-sm text-muted-foreground">
          在手机端打开应用，输入以下 6 位配对码完成绑定（5 分钟内有效）。
        </p>

        {pairCode ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-md border border-border bg-muted px-4 py-3 text-center">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-foreground">
                {pairCode}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={copyCode}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
                title="复制"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={generatePairCode}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {pairCode ? '重新生成' : '生成配对码'}
          </button>
          {pairCode && pairExpiry > 0 && (
            <span className="text-xs text-muted-foreground">
              {Math.floor(pairExpiry / 60)}:{String(pairExpiry % 60).padStart(2, '0')} 后过期
            </span>
          )}
        </div>
      </div>

      {/* Device list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-foreground">
            已注册设备
            {!loading && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {onlineCount} 在线 / {devices.length} 台
              </span>
            )}
          </h4>
          <button
            type="button"
            onClick={fetchDevices}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : devices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <Smartphone className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">暂无已注册设备</p>
            <p className="mt-1 text-xs text-muted-foreground/70">使用上方配对码添加第一台设备</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {devices.map(device => {
              const Icon = platformIcon(device.platform);
              const online = Boolean(device.is_online);
              return (
                <li
                  key={device.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{device.name}</span>
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          online
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {online ? '在线' : '离线'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {device.platform} · 最后活跃：{new Date(device.last_seen).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === device.id}
                    onClick={() => deleteDevice(device.id)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    title="移除设备"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
