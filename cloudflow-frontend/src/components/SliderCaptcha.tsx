import type { CSSProperties, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronsRight,
  CircleAlert,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { SLIDER_DEFAULT_HEIGHT, SLIDER_DEFAULT_WIDTH, SLIDER_KEYBOARD_STEP } from '@/constants/ui';
import { checkCaptcha, getCaptcha, type CaptchaResponse } from '@/services/api/auth';
import { cn } from '@/utils/cn';
import { logger } from '@/utils/logger';

const BG_ORIGIN_WIDTH = 300;
const BG_ORIGIN_HEIGHT = 150;
const SLIDER_BTN_WIDTH = 42;
const HANDLE_VISUAL_WIDTH = 36;
const HANDLE_INSET = (SLIDER_BTN_WIDTH - HANDLE_VISUAL_WIDTH) / 2;

interface SliderCaptchaProps {
  onVerify: (token: string) => void;
  width?: number;
  height?: number;
}

type CaptchaStatus = 'idle' | 'verifying' | 'success' | 'fail';

const STATUS_META: Record<
  CaptchaStatus,
  {
    label: string;
    assist: string;
  }
> = {
  idle: {
    label: '拖动滑块完成验证',
    assist: '支持方向键 / Enter',
  },
  verifying: {
    label: '正在校验位置',
    assist: '请稍候',
  },
  success: {
    label: '验证通过',
    assist: '即将继续当前流程',
  },
  fail: {
    label: '位置不准确，正在刷新拼图',
    assist: '请重新拖动',
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const SliderCaptcha = ({
  onVerify,
  width = SLIDER_DEFAULT_WIDTH,
  height = SLIDER_DEFAULT_HEIGHT,
}: SliderCaptchaProps) => {
  const [loading, setLoading] = useState(true);
  const [captchaData, setCaptchaData] = useState<CaptchaResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sliderLeft, setSliderLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<CaptchaStatus>('idle');
  const [renderWidth, setRenderWidth] = useState(width);
  const [bgNaturalSize, setBgNaturalSize] = useState({
    width: BG_ORIGIN_WIDTH,
    height: BG_ORIGIN_HEIGHT,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const startXRef = useRef(0);
  const originLeftRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const sliderLeftRef = useRef(0);

  const renderHeight = Math.round((renderWidth / width) * height);
  const scaleX = renderWidth / (bgNaturalSize.width || BG_ORIGIN_WIDTH);
  const scaleY = renderHeight / (bgNaturalSize.height || BG_ORIGIN_HEIGHT);
  const maxSliderLeft = Math.max(renderWidth - SLIDER_BTN_WIDTH, 0);
  const progressWidth = clamp(
    sliderLeft + HANDLE_VISUAL_WIDTH + HANDLE_INSET,
    HANDLE_VISUAL_WIDTH,
    renderWidth,
  );

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const resetSliderState = useCallback(() => {
    setStatus('idle');
    setSliderLeft(0);
    sliderLeftRef.current = 0;
    setIsDragging(false);
  }, []);

  const fetchCaptcha = useCallback(async () => {
    clearRefreshTimer();
    setLoading(true);
    setLoadError('');
    setCaptchaData(null);
    setBgNaturalSize({
      width: BG_ORIGIN_WIDTH,
      height: BG_ORIGIN_HEIGHT,
    });
    resetSliderState();

    try {
      const response = await getCaptcha();
      setCaptchaData(response);
    } catch (error) {
      logger.error('Failed to fetch captcha:', error);
      setLoadError('拼图加载失败，请重新加载');
    } finally {
      setLoading(false);
    }
  }, [clearRefreshTimer, resetSliderState]);

  useEffect(() => {
    void fetchCaptcha();
    return clearRefreshTimer;
  }, [clearRefreshTimer, fetchCaptcha]);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.min(width, Math.floor(entries[0]?.contentRect.width || width));
      if (nextWidth > 0) {
        setRenderWidth(nextWidth);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width]);

  useEffect(() => {
    setSliderLeft((current) => clamp(current, 0, maxSliderLeft));
    sliderLeftRef.current = clamp(sliderLeftRef.current, 0, maxSliderLeft);
  }, [maxSliderLeft]);

  useEffect(() => {
    sliderLeftRef.current = sliderLeft;
  }, [sliderLeft]);

  useEffect(() => {
    if (!loading && captchaData && !loadError) {
      trackRef.current?.focus();
    }
  }, [captchaData, loadError, loading]);

  const updateSliderPosition = useCallback(
    (clientX: number) => {
      const offset = clientX - startXRef.current;
      const nextLeft = clamp(originLeftRef.current + offset, 0, maxSliderLeft);
      sliderLeftRef.current = nextLeft;
      setSliderLeft(nextLeft);
    },
    [maxSliderLeft],
  );

  const verifyPosition = useCallback(
    async (currentLeft: number) => {
      if (!captchaData || loadError || status === 'verifying' || status === 'success' || currentLeft < 5) {
        return;
      }

      setStatus('verifying');

      try {
        const backendX = Math.round(currentLeft / scaleX);
        const response = await checkCaptcha({
          uuid: captchaData.uuid,
          x: backendX,
        });

        if (response?.passToken) {
          setStatus('success');
          refreshTimerRef.current = window.setTimeout(() => {
            onVerify(response.passToken);
          }, 320);
          return;
        }

        setStatus('fail');
        refreshTimerRef.current = window.setTimeout(() => {
          void fetchCaptcha();
        }, 960);
      } catch (error) {
        logger.error('Captcha verification failed:', error);
        setStatus('fail');
        refreshTimerRef.current = window.setTimeout(() => {
          void fetchCaptcha();
        }, 960);
      }
    },
    [captchaData, fetchCaptcha, loadError, onVerify, scaleX, status],
  );

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handleMouseMove = (event: MouseEvent) => updateSliderPosition(event.clientX);
    const handleTouchMove = (event: TouchEvent) => updateSliderPosition(event.touches[0].clientX);
    const handleDragEnd = () => {
      setIsDragging(false);
      void verifyPosition(sliderLeftRef.current);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, updateSliderPosition, verifyPosition]);

  const handleStart = (clientX: number) => {
    if (loading || loadError || status !== 'idle') {
      return;
    }

    startXRef.current = clientX;
    originLeftRef.current = sliderLeft;
    trackRef.current?.focus();
    setIsDragging(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (loading || loadError || status !== 'idle') {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        setSliderLeft((current) => clamp(current - SLIDER_KEYBOARD_STEP, 0, maxSliderLeft));
        break;
      case 'ArrowRight':
        event.preventDefault();
        setSliderLeft((current) => clamp(current + SLIDER_KEYBOARD_STEP, 0, maxSliderLeft));
        break;
      case 'Home':
        event.preventDefault();
        setSliderLeft(0);
        break;
      case 'End':
        event.preventDefault();
        setSliderLeft(maxSliderLeft);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        void verifyPosition(sliderLeft);
        break;
      default:
        break;
    }
  };

  const pieceStyle = useMemo<CSSProperties>(() => {
    if (!captchaData) {
      return {};
    }

    return {
      position: 'absolute',
      top: (captchaData.y || 0) * scaleY,
      left: sliderLeft,
      width: (captchaData.sliderWidth || 52) * scaleX,
      height: (captchaData.sliderHeight || 52) * scaleY,
      zIndex: 2,
      pointerEvents: 'none',
      filter: 'drop-shadow(0 4px 10px rgba(15, 23, 42, 0.18))',
      transition: isDragging ? 'none' : 'left 160ms cubic-bezier(0.1, 0.9, 0.2, 1)',
      willChange: 'left',
    };
  }, [captchaData, isDragging, scaleX, scaleY, sliderLeft]);

  const statusToneClass =
    status === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'fail'
        ? 'text-rose-600 dark:text-rose-400'
        : status === 'verifying'
          ? 'text-[var(--cf-primary-600)] dark:text-[var(--cf-primary-300)]'
          : 'text-cf-subtle';

  const trackProgressClass =
    status === 'success'
      ? 'from-emerald-500/22 via-emerald-400/12 to-transparent'
      : status === 'fail'
        ? 'from-rose-500/22 via-rose-400/12 to-transparent'
        : status === 'verifying'
          ? 'from-[var(--cf-primary-500)]/24 via-[var(--cf-primary-400)]/14 to-transparent'
          : 'from-[var(--cf-primary-500)]/18 via-[var(--cf-primary-400)]/10 to-transparent';

  const handleClass =
    status === 'success'
      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
      : status === 'fail'
        ? 'border-rose-500 bg-rose-500 text-white shadow-sm'
        : isDragging || status === 'verifying'
          ? 'border-[var(--cf-primary-500)] bg-[var(--cf-primary-500)] text-white shadow-sm'
          : 'border-slate-200 bg-cf-surface-1 text-cf-subtle shadow-sm transition-colors hover:border-[var(--cf-primary-400)] hover:text-[var(--cf-primary-600)] dark:border-slate-700 dark:hover:border-[var(--cf-primary-400)] dark:hover:text-[var(--cf-primary-300)]';

  const trackText = loadError
    ? '加载失败，请先重新加载'
    : status === 'idle'
      ? '向右拖动滑块'
      : STATUS_META[status].label;

  return (
    <div ref={containerRef} className="w-full">
      <div className="w-full" style={{ maxWidth: width }}>
        <div
          className="relative overflow-hidden rounded-[4px] border border-slate-200 bg-cf-surface-1/95 py-0 shadow-[0_10px_28px_rgba(0,0,0,0.09)] backdrop-blur-md dark:border-slate-700 /95"
        >
          {/* 拼图区 */}
          <div
            className="relative w-full overflow-hidden"
            style={{ width: renderWidth, height: renderHeight }}
          >
            <button
              type="button"
              className="no-min-size absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-white/60 bg-cf-surface-1/80 text-cf-subtle shadow-[0_1px_2px_rgba(0,0,0,0.08)] backdrop-blur-sm transition-colors hover:text-[var(--cf-primary-600)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600/60 /80 dark:hover:text-[var(--cf-primary-300)]"
              onClick={() => {
                void fetchCaptcha();
              }}
              disabled={loading || status === 'verifying'}
              data-tooltip="刷新验证码" aria-label="刷新验证码"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>

            {captchaData ? (
              <>
                <img
                  src={captchaData.bgImage}
                  alt="captcha background"
                  className="absolute inset-0 h-full w-full object-fill"
                  draggable={false}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    setBgNaturalSize({
                      width: image.naturalWidth || BG_ORIGIN_WIDTH,
                      height: image.naturalHeight || BG_ORIGIN_HEIGHT,
                    });
                  }}
                />
                <img
                  src={captchaData.sliderImage}
                  alt="captcha puzzle piece"
                  style={pieceStyle}
                  draggable={false}
                />
              </>
            ) : null}

            {/* 状态指示:卡顶主色细线 */}
            <div
              className={cn(
                'absolute inset-x-0 top-0 z-30 h-[2px] transition-colors duration-300',
                status === 'success'
                  ? 'bg-emerald-500'
                  : status === 'fail'
                    ? 'bg-rose-500'
                    : status === 'verifying'
                      ? 'bg-[var(--cf-primary-500)]'
                      : 'bg-transparent',
              )}
            />

            {loading ? (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-cf-surface-1/88 text-sm text-cf-subtle backdrop-blur-sm /88">
                <Loader2 size={18} className="animate-spin text-[var(--cf-primary-500)]" />
                <span>正在加载拼图…</span>
              </div>
            ) : null}

            {loadError ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-cf-surface-1/90 p-4 backdrop-blur-sm /88">
                <div className="w-full max-w-[15rem] rounded-[4px] border border-rose-200 bg-cf-surface-1 p-4 text-center shadow-[0_10px_28px_rgba(0,0,0,0.09)] dark:border-rose-900/50">
                  <CircleAlert size={18} className="mx-auto text-rose-500" />
                  <p className="mt-3 text-sm leading-6 text-cf-muted">
                    {loadError}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void fetchCaptcha();
                    }}
                    className="btn btn-secondary btn-sm no-min-size mt-4 w-full"
                  >
                    <RotateCcw size={14} />
                    重新加载
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* 溶合滑道:主色细线分隔 + 内嵌 */}
          <div className="relative border-t border-slate-200 bg-cf-surface-1/70 px-3 py-3 dark:border-slate-700/70 /40">
            <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
              <div className={cn('inline-flex min-w-0 items-center gap-2 text-[13px] font-medium', statusToneClass)}>
                {status === 'verifying' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : status === 'success' ? (
                  <CheckCircle2 size={13} />
                ) : status === 'fail' ? (
                  <XCircle size={13} />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--cf-primary-500)] animate-pulse" />
                )}
                <span className="truncate">{STATUS_META[status].label}</span>
              </div>
              <span className="shrink-0 text-[11px] text-cf-faint">
                {loadError ? '需要重新加载' : STATUS_META[status].assist}
              </span>
            </div>

            <div
              ref={trackRef}
              className={cn(
                'relative h-10 overflow-hidden rounded-[4px] border bg-cf-surface-1 transition-colors focus:outline-none /80',
                status === 'success'
                  ? 'border-emerald-300 dark:border-emerald-800/50'
                  : status === 'fail'
                    ? 'border-rose-300 dark:border-rose-800/50'
                    : 'border-slate-200 focus:border-[var(--cf-primary-500)] focus:shadow-[0_0_0_3px_rgba(13,149,181,0.16)] dark:border-slate-700',
              )}
              tabIndex={loadError ? -1 : 0}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={maxSliderLeft}
              aria-valuenow={Math.round(sliderLeft)}
              aria-valuetext={STATUS_META[status].label}
              aria-label="拖动滑块完成验证，也可以使用方向键"
              onKeyDown={handleKeyDown}
            >
              <div
                className={cn(
                  'absolute inset-y-0 left-0 bg-gradient-to-r transition-[width] duration-200',
                  trackProgressClass,
                )}
                style={{ width: progressWidth }}
              />

              <div
                className={cn(
                  'pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-10 text-center text-[13px] font-medium transition-opacity duration-200',
                  statusToneClass,
                )}
                style={{ opacity: sliderLeft > maxSliderLeft * 0.48 ? 0.28 : 1 }}
              >
                {trackText}
              </div>

              <button
                type="button"
                className={cn(
                  'no-min-size absolute bottom-[3px] top-[3px] z-20 inline-flex items-center justify-center rounded-[4px] border transition',
                  handleClass,
                )}
                style={{ left: sliderLeft + HANDLE_INSET, width: HANDLE_VISUAL_WIDTH }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleStart(event.clientX);
                }}
                onTouchStart={(event) => handleStart(event.touches[0].clientX)}
                disabled={loading || Boolean(loadError) || status === 'verifying' || status === 'success'}
                aria-hidden="true"
              >
                {status === 'verifying' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : status === 'success' ? (
                  <CheckCircle2 size={15} />
                ) : status === 'fail' ? (
                  <XCircle size={15} />
                ) : (
                  <ChevronsRight size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
