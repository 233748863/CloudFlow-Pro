import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronsRight, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { checkCaptcha, getCaptcha, type CaptchaResponse } from '@/services/api/auth';
import { SLIDER_KEYBOARD_STEP } from '@/constants/ui';
import { logger } from '@/utils/logger';

const BG_ORIGIN_WIDTH = 300;
const BG_ORIGIN_HEIGHT = 150;
const SLIDER_BTN_WIDTH = 40;
const HANDLE_VISUAL_WIDTH = 34;
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
    assist: '支持方向键操作',
  },
  verifying: {
    label: '正在校验位置',
    assist: '请稍候',
  },
  success: {
    label: '验证通过',
    assist: '即将继续',
  },
  fail: {
    label: '位置不准确，请重试',
    assist: '正在刷新拼图',
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const SliderCaptcha: React.FC<SliderCaptchaProps> = ({
  onVerify,
  width = 300,
  height = 150,
}) => {
  const [loading, setLoading] = useState(true);
  const [captchaData, setCaptchaData] = useState<CaptchaResponse | null>(null);
  const [sliderLeft, setSliderLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<CaptchaStatus>('idle');

  const startXRef = useRef(0);
  const originLeftRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const sliderLeftRef = useRef(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const scaleX = width / BG_ORIGIN_WIDTH;
  const scaleY = height / BG_ORIGIN_HEIGHT;
  const maxSliderLeft = width - SLIDER_BTN_WIDTH;

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const fetchCaptcha = useCallback(async () => {
    clearRefreshTimer();
    setLoading(true);
    setCaptchaData(null);
    setStatus('idle');
    setSliderLeft(0);
    setIsDragging(false);

    try {
      const response = await getCaptcha();
      setCaptchaData(response);
    } catch (error) {
      logger.error('Failed to fetch captcha:', error);
      toast.error('验证码加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [clearRefreshTimer]);

  useEffect(() => {
    void fetchCaptcha();
    return clearRefreshTimer;
  }, [clearRefreshTimer, fetchCaptcha]);

  useEffect(() => {
    if (!loading && captchaData) {
      trackRef.current?.focus();
    }
  }, [captchaData, loading]);

  const updateSliderPosition = useCallback(
    (clientX: number) => {
      const offset = clientX - startXRef.current;
      const nextLeft = clamp(originLeftRef.current + offset, 0, maxSliderLeft);
      sliderLeftRef.current = nextLeft;
      setSliderLeft(nextLeft);
    },
    [maxSliderLeft],
  );

  useEffect(() => {
    sliderLeftRef.current = sliderLeft;
  }, [sliderLeft]);

  const verifyPosition = useCallback(
    async (currentLeft: number) => {
      if (!captchaData || status === 'verifying' || status === 'success' || currentLeft < 5) {
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
        toast.error('验证失败，请重试');
        refreshTimerRef.current = window.setTimeout(() => {
          void fetchCaptcha();
        }, 900);
      } catch (error) {
        logger.error('Captcha verification failed:', error);
        setStatus('fail');
        toast.error('验证失败，请重试');
        refreshTimerRef.current = window.setTimeout(() => {
          void fetchCaptcha();
        }, 900);
      }
    },
    [captchaData, fetchCaptcha, onVerify, scaleX, status],
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
    if (loading || status !== 'idle') {
      return;
    }

    startXRef.current = clientX;
    originLeftRef.current = sliderLeft;
    setIsDragging(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (loading || status !== 'idle') {
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

  const pieceStyle = useMemo<React.CSSProperties>(() => {
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
      filter: 'drop-shadow(0 10px 18px rgba(15, 23, 42, 0.24))',
      transition: isDragging ? 'none' : 'left 120ms ease',
      willChange: 'left',
    };
  }, [captchaData, isDragging, scaleX, scaleY, sliderLeft]);

  const progressWidth = Math.min(width, sliderLeft + SLIDER_BTN_WIDTH / 2);

  const statusToneClass =
    status === 'success'
      ? 'text-emerald-600 dark:text-emerald-300'
      : status === 'fail'
        ? 'text-red-600 dark:text-red-300'
        : status === 'verifying'
          ? 'text-teal-700 dark:text-teal-300'
          : 'text-slate-500 dark:text-slate-400';

  const statusDotClass =
    status === 'success'
      ? 'bg-emerald-500'
      : status === 'fail'
        ? 'bg-red-500'
        : status === 'verifying'
          ? 'bg-teal-500'
          : 'bg-slate-400';

  const trackProgressClass =
    status === 'success'
      ? 'from-emerald-500/30 via-emerald-400/20 to-transparent'
      : status === 'fail'
        ? 'from-red-500/28 via-red-400/16 to-transparent'
        : status === 'verifying'
          ? 'from-teal-500/32 via-cyan-400/18 to-transparent'
          : 'from-teal-500/26 via-cyan-400/14 to-transparent';

  const handleClass =
    status === 'success'
      ? 'border-emerald-500 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-[0_12px_24px_rgba(34,197,94,0.3)]'
      : status === 'fail'
        ? 'border-red-500 bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-[0_12px_24px_rgba(239,68,68,0.28)]'
        : isDragging || status === 'verifying'
          ? 'border-teal-500 bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-[0_12px_24px_rgba(13,148,136,0.28)]'
          : 'border-white/90 bg-white/96 text-slate-500 shadow-[0_10px_22px_rgba(15,23,42,0.14)] hover:text-teal-700 dark:border-dark-700 dark:bg-dark-800/96 dark:text-slate-200 dark:hover:text-teal-300';

  return (
    <div className="space-y-4" style={{ width }}>
      <div
        className={[
          'relative overflow-hidden rounded-[1.4rem] border bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]',
          'dark:bg-dark-900 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
          status === 'success'
            ? 'border-emerald-200 dark:border-emerald-900/40'
            : status === 'fail'
              ? 'border-red-200 dark:border-red-900/40'
              : 'border-slate-200 dark:border-dark-700',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ width, height }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.42),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]" />

        <button
          type="button"
          className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/80 bg-white/90 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-700 dark:bg-dark-800/90 dark:text-slate-300 dark:hover:bg-dark-700 dark:hover:text-white"
          onClick={() => {
            void fetchCaptcha();
          }}
          disabled={loading || status === 'verifying'}
          title="刷新验证码"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>

        {loading ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-slate-100/85 text-sm text-slate-500 backdrop-blur-sm dark:bg-dark-900/82 dark:text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <span>正在载入拼图…</span>
          </div>
        ) : null}

        {captchaData ? (
          <>
            <img
              src={captchaData.bgImage}
              alt="captcha background"
              style={{
                position: 'absolute',
                inset: 0,
                width,
                height,
              }}
              draggable={false}
            />
            <img
              src={captchaData.sliderImage}
              alt="captcha puzzle piece"
              style={pieceStyle}
              draggable={false}
            />
          </>
        ) : null}

        {(status === 'success' || status === 'fail') && !loading ? (
          <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center">
            <div
              className={[
                'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md',
                status === 'success'
                  ? 'bg-emerald-500/88 text-white'
                  : 'bg-red-500/88 text-white',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {status === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {status === 'success' ? '验证通过' : '位置不准确'}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-[1.3rem] border border-slate-200 bg-white/88 p-3 shadow-[0_18px_34px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-dark-700 dark:bg-dark-900/84 dark:shadow-[0_20px_40px_rgba(2,6,23,0.34)]">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className={`inline-flex min-w-0 items-center gap-2 text-xs font-medium ${statusToneClass}`}>
            {status === 'verifying' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : status === 'success' ? (
              <CheckCircle2 size={14} />
            ) : status === 'fail' ? (
              <XCircle size={14} />
            ) : (
              <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
            )}
            <span className="truncate">{STATUS_META[status].label}</span>
          </div>
          <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
            {STATUS_META[status].assist}
          </span>
        </div>

        <div
          ref={trackRef}
          className={[
            'relative h-14 overflow-hidden rounded-2xl border bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500/20',
            'dark:bg-dark-950/78',
            status === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/40'
              : status === 'fail'
                ? 'border-red-200 dark:border-red-900/40'
                : 'border-slate-200 dark:border-dark-700',
          ]
            .filter(Boolean)
            .join(' ')}
          tabIndex={0}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={maxSliderLeft}
          aria-valuenow={Math.round(sliderLeft)}
          aria-valuetext={STATUS_META[status].label}
          aria-label="拖动滑块完成验证，也可使用方向键操作"
          onKeyDown={handleKeyDown}
        >
          <div
            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${trackProgressClass} transition-[width] duration-200`}
            style={{ width: progressWidth }}
          />

          <div
            className={[
              'pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-14 text-center text-xs font-medium transition-opacity duration-200',
              statusToneClass,
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ opacity: sliderLeft > maxSliderLeft * 0.48 ? 0.35 : 1 }}
          >
            {status === 'idle' ? '向右拖动滑块' : STATUS_META[status].label}
          </div>

          <button
            type="button"
            className={[
              'absolute bottom-[5px] top-[5px] z-20 inline-flex items-center justify-center rounded-xl border transition',
              handleClass,
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: sliderLeft + HANDLE_INSET, width: HANDLE_VISUAL_WIDTH }}
            onMouseDown={(event) => {
              event.preventDefault();
              handleStart(event.clientX);
            }}
            onTouchStart={(event) => handleStart(event.touches[0].clientX)}
            disabled={loading || status === 'verifying' || status === 'success'}
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
          {STATUS_META[status].label}
        </div>
      </div>
    </div>
  );
};
