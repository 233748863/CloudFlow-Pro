import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './button';
import { isTauriRuntime } from '@/services/desktopConfig';
import { watchPwaUpdates } from '@/utils/pwaUpdates';

// 布局：状态说明 → 更新提醒 → [稍后] [保存后更新]；复用现有主题色与按钮尺寸。
export function PwaUpdatePrompt() {
  const [available, setAvailable] = useState(false);
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState(false);
  const updater = useRef<ReturnType<typeof watchPwaUpdates> | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV || import.meta.env.MODE === 'tauri' || isTauriRuntime() || !('serviceWorker' in navigator)) return;
    const manager = watchPwaUpdates({
      serviceWorker: navigator.serviceWorker,
      scriptUrl: `${import.meta.env.BASE_URL}sw.js`,
      onAvailable(value) {
        setAvailable(value);
        setApplying(false);
        setFailed(false);
      },
      onError() {
        setApplying(false);
        setFailed(true);
      },
      reload: () => window.location.reload(),
    });
    updater.current = manager;
    return () => {
      updater.current = null;
      manager.dispose();
    };
  }, []);

  if (!available) return null;
  return (
    <aside role="status" aria-live="polite" className="fixed left-4 right-4 z-[100] rounded-xl border border-[var(--cf-border)] bg-cf-surface-1 p-4 text-cf-title shadow-lg sm:left-auto sm:w-96" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}>
      <p className="flex items-center gap-2 font-semibold"><RefreshCw size={18} aria-hidden="true" />发现新版本</p>
      <p className="mt-2 text-sm text-cf-muted">更新会刷新页面，请先保存当前填写的内容。</p>
      {failed && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">更新暂未成功，请稍后重试。</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-11 min-w-11" disabled={applying} onClick={() => setAvailable(false)}>稍后</Button>
        <Button type="button" className="min-h-11" disabled={applying} onClick={() => { setApplying(true); setFailed(false); updater.current?.applyUpdate(); }}>{applying ? '正在更新…' : '已保存，立即更新'}</Button>
      </div>
    </aside>
  );
}
