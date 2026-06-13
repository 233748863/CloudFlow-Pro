import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X, Square, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';

export const CustomTitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = React.useState(false);
  const isTogglingMaximizeRef = React.useRef(false);

  React.useEffect(() => {
    const appWindow = getCurrentWindow();

    const checkMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch {
        setIsMaximized(false);
      }
    };

    checkMaximized();

    const unlisten = appWindow.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.minimize().catch(() => undefined);
  };

  const handleMaximize = async () => {
    if (isTogglingMaximizeRef.current) {
      return;
    }

    isTogglingMaximizeRef.current = true;
    const appWindow = getCurrentWindow();
    try {
      await appWindow.toggleMaximize();
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    } catch {
      setIsMaximized(false);
    } finally {
      window.setTimeout(() => {
        isTogglingMaximizeRef.current = false;
      }, 180);
    }
  };

  const handleClose = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close().catch(() => undefined);
  };

  const handleDragStart = async (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) {
      return;
    }

    await getCurrentWindow().startDragging().catch(() => undefined);
  };

  return (
    <div
      onPointerDown={handleDragStart}
      onDoubleClick={handleMaximize}
      className="cf-titlebar fixed left-0 right-0 top-0 z-50 flex h-8 select-none items-center justify-between border-b border-slate-200/60 bg-white/95 backdrop-blur-xl transition-colors dark:border-slate-800/60 dark:bg-slate-950/95"
    >
      {/* 左侧：Logo 和标题 */}
      <div className="flex h-full items-center gap-2 px-3">
        <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-lg border border-cyan-100/80 bg-white shadow-sm dark:border-cyan-950/40 dark:bg-slate-900">
          <img src="/icon.svg" alt="CloudFlow Pro" className="h-4 w-4 object-contain" />
        </div>
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-slate-700 dark:text-slate-300">
          CloudFlow Pro
        </span>
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="flex h-full" onDoubleClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={handleMinimize}
          className={cn(
            'cf-titlebar-btn',
            'hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
          title="最小化"
        >
          <Minus size={14} strokeWidth={2.5} />
        </button>

        <button
          type="button"
          onClick={handleMaximize}
          className={cn(
            'cf-titlebar-btn',
            'hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="8" height="8" rx="1" />
              <path d="M5 3V1.5C5 1.22 5.22 1 5.5 1H12.5C12.78 1 13 1.22 13 1.5V8.5C13 8.78 12.78 9 12.5 9H11" />
            </svg>
          ) : (
            <Square size={14} strokeWidth={1.5} />
          )}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className={cn(
            'cf-titlebar-btn',
            'hover:bg-red-500 hover:text-white dark:hover:bg-red-600'
          )}
          title="关闭"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};
