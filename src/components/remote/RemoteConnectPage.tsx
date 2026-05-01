import { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone, Wifi, WifiOff, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useWebRTCSignal, type RTCStatus } from '../../hooks/useWebRTCSignal';

type Device = {
  id: string;
  name: string;
  platform: string;
  is_online: number;
  last_seen: string;
};

type Props = {
  onConnected: (deviceId: string, send: (data: string) => boolean) => void;
  onBack: () => void;
};

function statusLabel(s: RTCStatus): string {
  const map: Record<RTCStatus, string> = {
    idle: '',
    connecting: '正在连接信令服务器…',
    signaling: '正在握手…',
    'p2p-connecting': '正在建立 P2P 通道…',
    connected: 'P2P 连接成功！',
    error: '连接失败',
    closed: '连接已关闭',
  };
  return map[s];
}

function DeviceIcon({ platform }: { platform: string }) {
  const isMobile = platform === 'mobile' || platform === 'ios' || platform === 'android';
  const Icon = isMobile ? Smartphone : Monitor;
  return <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />;
}

export default function RemoteConnectPage({ onConnected, onBack }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const token = localStorage.getItem('auth-token') ?? '';

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/devices', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleMessage = useCallback((data: string) => {
    // Messages from desktop device — handled by parent after connection
    console.log('[RTC] message from device:', data);
  }, []);

  const { status, error, connect, disconnect, send } = useWebRTCSignal({
    token,
    deviceId: selectedId,
    onMessage: handleMessage,
  });

  // Auto-notify parent when connected
  useEffect(() => {
    if (status === 'connected' && selectedId) {
      onConnected(selectedId, send);
    }
  }, [status, selectedId, send, onConnected]);

  const handleSelect = (device: Device) => {
    if (!device.is_online) return;
    setSelectedId(device.id);
  };

  useEffect(() => {
    if (selectedId && status === 'idle') {
      connect();
    }
  }, [selectedId, status, connect]);

  const isConnecting = ['connecting', 'signaling', 'p2p-connecting'].includes(status);
  const isError = status === 'error' || status === 'closed';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => { disconnect(); onBack(); }}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">选择远程设备</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Connection status overlay */}
        {(isConnecting || status === 'connected' || isError) && (
          <div className={`rounded-lg border p-4 flex items-start gap-3 ${
            isError
              ? 'border-destructive/50 bg-destructive/10'
              : status === 'connected'
              ? 'border-green-500/50 bg-green-500/10'
              : 'border-border bg-muted/50'
          }`}>
            {isConnecting && <Loader2 className="h-5 w-5 mt-0.5 animate-spin text-primary flex-shrink-0" />}
            {status === 'connected' && <CheckCircle2 className="h-5 w-5 mt-0.5 text-green-500 flex-shrink-0" />}
            {isError && <AlertCircle className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{statusLabel(status)}</p>
              {error && <p className="text-xs text-muted-foreground mt-1">{error}</p>}
            </div>
            {isError && (
              <button
                type="button"
                onClick={() => { setSelectedId(null); disconnect(); }}
                className="text-xs text-primary hover:underline flex-shrink-0"
              >
                重试
              </button>
            )}
          </div>
        )}

        {/* Device list */}
        {loading ? (
          <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">加载设备列表…</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <Monitor className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-foreground">没有已注册的设备</p>
              <p className="mt-1 text-xs text-muted-foreground">
                在桌面端安装客户端后，前往设置 → 远程设备 → 生成配对码完成绑定
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {devices.map((device) => {
              const online = Boolean(device.is_online);
              const isSelected = device.id === selectedId;
              return (
                <li key={device.id}>
                  <button
                    type="button"
                    disabled={!online || isConnecting}
                    onClick={() => handleSelect(device)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors
                      ${isSelected && isConnecting
                        ? 'border-primary/50 bg-primary/5'
                        : online
                        ? 'border-border bg-card hover:bg-accent active:bg-accent/80'
                        : 'border-border bg-card opacity-50 cursor-not-allowed'
                      }`}
                  >
                    <DeviceIcon platform={device.platform} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{device.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        最后活跃：{new Date(device.last_seen).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium flex-shrink-0 ${
                      online
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {online
                        ? <><Wifi className="h-3 w-3" />在线</>
                        : <><WifiOff className="h-3 w-3" />离线</>
                      }
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Refresh */}
        {!loading && !isConnecting && (
          <button
            type="button"
            onClick={fetchDevices}
            className="w-full rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          >
            刷新设备列表
          </button>
        )}
      </div>
    </div>
  );
}
