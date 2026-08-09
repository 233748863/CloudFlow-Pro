import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/cn';
import './common-primitives.css';

export interface AutoRefreshButtonProps {
  enabled: boolean;
  intervalSeconds: number;
  onEnabledChange: (enabled: boolean) => void;
  onIntervalChange: (seconds: number) => void;
  onRefresh: () => void | Promise<void>;
  intervals?: number[];
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const intervalLabel = (seconds: number) => seconds % 60 === 0 ? `${seconds / 60} 分钟` : `${seconds} 秒`;

export const AutoRefreshButton: React.FC<AutoRefreshButtonProps> = ({
  enabled,
  intervalSeconds,
  onEnabledChange,
  onIntervalChange,
  onRefresh,
  intervals = [15, 30, 60, 300],
  loading = false,
  disabled = false,
  className,
}) => {
  const [countdown, setCountdown] = useState(intervalSeconds);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const refreshRef = useRef(onRefresh);
  const refreshingRef = useRef(false);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current || disabled) return;
    refreshingRef.current = true;
    try {
      await refreshRef.current();
    } finally {
      refreshingRef.current = false;
    }
  }, [disabled]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setPageVisible(visible);
      if (visible && enabled) {
        setCountdown(intervalSeconds);
        void runRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, intervalSeconds, runRefresh]);

  useEffect(() => {
    setCountdown(intervalSeconds);
    if (!enabled || !pageVisible || disabled) return undefined;

    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          void runRefresh();
          return intervalSeconds;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [disabled, enabled, intervalSeconds, pageVisible, runRefresh]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeFromOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeFromOutside);
    window.addEventListener('keydown', closeFromEscape);
    return () => {
      document.removeEventListener('mousedown', closeFromOutside);
      window.removeEventListener('keydown', closeFromEscape);
    };
  }, [menuOpen]);

  const label = enabled ? `自动刷新 ${countdown}s` : '开启自动刷新';

  return (
    <div ref={wrapperRef} className={cn('cf-auto-refresh', className)}>
      <button
        type="button"
        className={cn('cf-auto-refresh-main', enabled && 'is-enabled')}
        disabled={disabled}
        aria-pressed={enabled}
        onClick={() => {
          const nextEnabled = !enabled;
          onEnabledChange(nextEnabled);
          setCountdown(intervalSeconds);
          if (nextEnabled) void runRefresh();
        }}
      >
        <RefreshCw size={15} className={cn((loading || refreshingRef.current) && 'animate-spin')} />
        <span>{label}</span>
      </button>
      <button
        type="button"
        className="cf-auto-refresh-toggle"
        disabled={disabled}
        aria-label="选择自动刷新间隔"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span>{intervalLabel(intervalSeconds)}</span>
        <ChevronDown size={14} className={cn('transition-transform duration-200', menuOpen && 'rotate-180')} />
      </button>
      {menuOpen ? (
        <div className="cf-auto-refresh-menu" role="menu">
          {intervals.map((seconds) => (
            <button
              key={seconds}
              type="button"
              role="menuitemradio"
              aria-checked={seconds === intervalSeconds}
              className={cn('cf-auto-refresh-option', seconds === intervalSeconds && 'is-active')}
              onClick={() => {
                setMenuOpen(false);
                setCountdown(seconds);
                onIntervalChange(seconds);
                if (!enabled) {
                  onEnabledChange(true);
                  void runRefresh();
                }
              }}
            >
              <span>{intervalLabel(seconds)}</span>
              {seconds === intervalSeconds ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

