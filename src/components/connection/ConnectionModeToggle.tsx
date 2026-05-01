import { useEffect, useState } from 'react';
import { Globe, Wifi, WifiOff } from 'lucide-react';

type Mode = 'online' | 'lan' | 'offline';

const MODES: { value: Mode; label: string; icon: React.ReactNode; title: string }[] = [
  { value: 'online', label: '在线', icon: <Globe className="h-3.5 w-3.5" />, title: '通过 Render 信令服务器连接手机' },
  { value: 'lan', label: '局域网', icon: <Wifi className="h-3.5 w-3.5" />, title: '通过本地网络连接手机' },
  { value: 'offline', label: '离线', icon: <WifiOff className="h-3.5 w-3.5" />, title: '不建立远程连接' },
];

export default function ConnectionModeToggle() {
  const [mode, setMode] = useState<Mode>('online');
  const [saving, setSaving] = useState(false);
  const [signalingOk, setSignalingOk] = useState(true);

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;

  useEffect(() => {
    if (!api) return;
    api.getConfig().then(cfg => {
      const m = cfg.connectionMode;
      if (m === 'lan' || m === 'offline' || m === 'online') setMode(m);
      setSignalingOk(!!(cfg.signalingToken));
    });
    const unsub = api.onSignalingAuthFailed?.(() => setSignalingOk(false));
    return () => unsub?.();
  }, [api]);

  const select = async (m: Mode) => {
    if (!api || saving || m === mode) return;
    setSaving(true);
    setMode(m);
    await api.setConfig({ connectionMode: m });
    setSaving(false);
  };

  if (!api) return null;

  return (
    <div className="px-2 py-1.5 hidden md:block">
      <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
        {MODES.map(({ value, label, icon, title }) => (
          <button
            key={value}
            title={title}
            disabled={saving}
            onClick={() => select(value)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              mode === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
