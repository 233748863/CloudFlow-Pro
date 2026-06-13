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
      filter: 'drop-shadow(0 8px 16px rgba(15, 23, 42, 0.22))',
      transition: isDragging ? 'none' : 'left 120ms ease',
      willChange: 'left',
    };
  }, [captchaData, isDragging, scaleX, scaleY, sliderLeft]);

  const statusToneClass =
    status === 'success'
      ? 'text-emerald-600 dark:text-emerald-300'
      : status === 'fail'
        ? 'text-rose-600 dark:text-rose-300'
        : status === 'verifying'
          ? 'text-slate-700 dark:text-slate-300'
          : 'text-slate-500 dark:text-slate-400';

  const trackProgressClass =
    status === 'success'
      ? 'from-emerald-500/18 via-emerald-400/10 to-transparent'
      : status === 'fail'
        ? 'from-rose-500/18 via-rose-400/10 to-transparent'
        : status === 'verifying'
          ? 'from-teal-500/18 via-teal-400/10 to-transparent'
          : 'from-teal-500/14 via-teal-400/8 to-transparent';

  const handleClass =
    status === 'success'
      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
      : status === 'fail'
        ? 'border-rose-500 bg-rose-500 text-white shadow-sm'
        : isDragging || status === 'verifying'
          ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white';

  const trackText = loadError
    ? '加载失败，请先重新加载'
    : status === 'idle'
      ? '向右拖动滑块'
      : STATUS_META[status].label;

  return (
    <div ref={containerRef} className="w-full">
      <div className="w-full" style={{ maxWidth: width }}>
        <div
          className="relative overflow-hidden rounded-[1.2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
          style={{ width: renderWidth, height: renderHeight }}
        >
          <button
            type="button"
            className="no-min-size absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
            onClick={() => {
              void fetchCaptcha();
            }}
            disabled={loading || status === 'verifying'}
            title="刷新验证码"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
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

          {loading ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/88 text-sm text-slate-500 backdrop-blur-sm dark:bg-slate-950/88 dark:text-slate-400">
              <Loader2 size={18} className="animate-spin" />
              <span>正在加载拼图…</span>
            </div>
          ) : null}

          {loadError ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/90 p-4 backdrop-blur-sm dark:bg-slate-950/88">
              <div className="w-full max-w-[16rem] rounded-2xl border border-rose-200 bg-white p-4 text-center shadow-sm dark:border-rose-900/60 dark:bg-slate-900/94">
                <CircleAlert size={18} className="mx-auto text-rose-500" />
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
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

        <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/55">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div className={cn('inline-flex min-w-0 items-center gap-2 text-sm font-medium', statusToneClass)}>
              {status === 'verifying' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : status === 'success' ? (
                <CheckCircle2 size={14} />
              ) : status === 'fail' ? (
                <XCircle size={14} />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-500" />
              )}
              <span className="truncate">{STATUS_META[status].label}</span>
            </div>
            <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
              {loadError ? '需要重新加载' : STATUS_META[status].assist}
            </span>
          </div>

          <div
            ref={trackRef}
            className={cn(
              'relative h-14 overflow-hidden rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:bg-slate-900',
              status === 'success'
                ? 'border-emerald-200 dark:border-emerald-900/40'
                : status === 'fail'
                  ? 'border-rose-200 dark:border-rose-900/40'
                  : 'border-slate-200 dark:border-slate-700',
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
                'pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-14 text-center text-xs font-medium transition-opacity duration-200',
                statusToneClass,
              )}
              style={{ opacity: sliderLeft > maxSliderLeft * 0.48 ? 0.32 : 1 }}
            >
              {trackText}
            </div>

            <button
              type="button"
              className={cn(
                'no-min-size absolute bottom-[5px] top-[5px] z-20 inline-flex items-center justify-center rounded-xl border transition',
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

          <div className="sr-only" aria-live="polite">
            {loadError || STATUS_META[status].label}
          </div>
        </div>
      </div>
    </div>
  );
};
