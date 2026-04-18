import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getCaptcha, checkCaptcha } from '@/services/api/auth';
import { useMount } from '@/hooks/useMount';
import { SLIDER_KEYBOARD_STEP } from '@/constants/ui';
import { logger } from '@/utils/logger';

/** 后端生成的背景图原始尺寸 */
const BG_ORIGIN_WIDTH = 300;
const BG_ORIGIN_HEIGHT = 150;

/** 滑块按钮宽度 */
const SLIDER_BTN_WIDTH = 40;

/**
 * 滑块验证码组件属性
 */
interface SliderCaptchaProps {
  /** 验证成功回调，返回验证 token */
  onVerify: (token: string) => void;
  /** 验证码显示宽度，默认 300px */
  width?: number;
  /** 验证码显示高度，默认 150px */
  height?: number;
}

/**
 * 滑块验证码组件
 * 支持鼠标、触摸和键盘操作
 */
export const SliderCaptcha: React.FC<SliderCaptchaProps> = ({ 
  onVerify, 
  width = 300, 
  height = 150 
}) => {
  const [loading, setLoading] = useState(true);
  const [captchaData, setCaptchaData] = useState<any>(null);
  const [sliderLeft, setSliderLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'fail'>('idle');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  /** 前端显示宽度与后端原始图片宽度的缩放比例 */
  const scaleX = width / BG_ORIGIN_WIDTH;
  const scaleY = height / BG_ORIGIN_HEIGHT;

  const fetchCaptcha = async () => {
    setLoading(true);
    setStatus('idle');
    setSliderLeft(0);
    try {
      const res = await getCaptcha();
      if (res) {
        setCaptchaData(res);
      }
    } catch (e) {
      logger.error('Failed to fetch captcha:', e);
      toast.error('验证码加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useMount(() => {
    fetchCaptcha();
  });

  const handleStart = (clientX: number) => {
    if (status === 'success' || status === 'verifying') return;
    setIsDragging(true);
    setStartX(clientX);
  };

  const handleMove = useCallback((clientX: number) => {
    if (!isDragging || !containerRef.current) return;
    const diff = clientX - startX;
    const max = width - SLIDER_BTN_WIDTH;
    const newLeft = Math.max(0, Math.min(max, diff));
    setSliderLeft(newLeft);
  }, [isDragging, startX, width]);

  const handleEnd = async () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    if (sliderLeft < 5) return; // 忽略微小移动
    
    setStatus('verifying');
    try {
      // 将前端滑块位置转换为后端坐标系
      // 前端滑块范围: [0, width - SLIDER_BTN_WIDTH]
      // 后端 X 坐标范围: [0, BG_ORIGIN_WIDTH - SLIDER_BTN_WIDTH/scaleX]
      // 简化：直接用 sliderLeft / scaleX 转换
      const backendX = Math.round(sliderLeft / scaleX);
      
      const res = await checkCaptcha({
        uuid: captchaData.uuid,
        x: backendX
      });
      
      if (res && res.passToken) {
        setStatus('success');
        onVerify(res.passToken);
      } else {
        setStatus('fail');
        toast.error('验证失败，请重试');
        setTimeout(() => {
          fetchCaptcha();
        }, 1000);
      }
    } catch (e) {
      logger.error('Captcha verification failed:', e);
      setStatus('fail');
      toast.error('验证失败，请重试');
      setTimeout(() => {
        fetchCaptcha();
      }, 1000);
    }
  };

  // Mouse Events
  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX);
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX);
  const onMouseUp = () => handleEnd();
  const onMouseLeave = () => { if (isDragging) handleEnd(); };

  // Touch Events
  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);
  const onTouchEnd = () => handleEnd();

  // Keyboard Events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (status === 'success' || status === 'verifying') return;
    
    const max = width - SLIDER_BTN_WIDTH;
    
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setSliderLeft(prev => Math.max(0, prev - SLIDER_KEYBOARD_STEP));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setSliderLeft(prev => Math.min(max, prev + SLIDER_KEYBOARD_STEP));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (sliderLeft > 0) {
          setIsDragging(true);
          handleEnd();
        }
        break;
      case 'Home':
        e.preventDefault();
        setSliderLeft(0);
        break;
      case 'End':
        e.preventDefault();
        setSliderLeft(max);
        break;
    }
  };

  // 计算滑块图片在前端的显示尺寸和位置
  const getSliderStyle = (): React.CSSProperties => {
    if (!captchaData) return {};
    
    const sliderW = (captchaData.sliderWidth || 52) * scaleX;
    const sliderH = (captchaData.sliderHeight || 52) * scaleY;
    const sliderY = (captchaData.y || 0) * scaleY;
    
    return {
      position: 'absolute',
      top: sliderY,
      left: sliderLeft,
      width: sliderW,
      height: sliderH,
      zIndex: 10,
      filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))',
      pointerEvents: 'none' as const,
    };
  };

  return (
    <div className="w-full select-none" style={{ width }} onMouseLeave={onMouseLeave}>
      {/* Image Area */}
      <div 
        ref={imageContainerRef}
        className="relative overflow-hidden rounded-t-lg bg-slate-100" 
        style={{ width, height }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-20">
            <Loader2 className="animate-spin text-slate-400" />
          </div>
        )}
        
        {/* Status Overlay */}
        {status === 'success' && (
           <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-emerald-500/20 transition-all">
               <CheckCircle2 className="text-emerald-500 w-10 h-10 mb-2" />
               <span className="text-emerald-600 font-bold text-sm">验证通过</span>
           </div>
        )}
        {status === 'fail' && (
           <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-red-500/20 transition-all">
               <XCircle className="text-red-500 w-10 h-10 mb-2" />
               <span className="text-red-600 font-bold text-sm">验证失败</span>
           </div>
        )}

        {/* Refresh Button */}
        <button 
           onClick={(e) => { e.preventDefault(); fetchCaptcha(); }}
           className="absolute top-2 right-2 z-30 rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
           title="刷新验证码"
        >
           <RefreshCw size={14} />
        </button>

        {captchaData && (
          <>
            {/* 背景图：使用精确尺寸，不使用 object-cover 避免缩放偏移 */}
            <img 
              src={captchaData.bgImage} 
              alt="bg" 
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                width: width,
                height: height,
              }}
              draggable={false}
            />
            {/* 滑块拼图图片 */}
            <img 
              src={captchaData.sliderImage} 
              alt="slider" 
              style={getSliderStyle()}
              draggable={false}
            />
          </>
        )}
      </div>

      {/* Track Area */}
      <div 
        ref={containerRef}
        className="relative h-10 bg-slate-100 rounded-b-lg border border-slate-200 flex items-center px-2"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={width - SLIDER_BTN_WIDTH}
        aria-valuenow={sliderLeft}
        aria-label="拖动滑块完成验证，也可使用方向键操作"
      >
        <div className="text-xs text-slate-400 w-full text-center select-none">向右拖动滑块填充拼图</div>
        
        {/* Slider Button */}
        <div 
          className={`absolute top-0 h-10 flex items-center justify-center cursor-pointer shadow-sm border border-slate-200 transition-colors z-20 rounded-sm
            ${isDragging ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white hover:bg-slate-50 text-slate-500'}
            ${status === 'success' ? '!bg-emerald-500 !border-emerald-500 !text-white' : ''}
            ${status === 'fail' ? '!bg-red-500 !border-red-500 !text-white' : ''}
          `}
          style={{ left: sliderLeft, width: SLIDER_BTN_WIDTH }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          <div className="w-1 h-3 rounded-full bg-current opacity-50 mx-[1px]" />
          <div className="w-1 h-3 rounded-full bg-current opacity-50 mx-[1px]" />
        </div>
        
        {/* Progress Bar */}
        <div 
          className={`absolute top-0 left-0 h-full bg-emerald-50 border-y border-emerald-100/60 transition-all rounded-bl-lg
            ${status === 'success' ? '!bg-emerald-100 !border-emerald-200' : ''}
            ${status === 'fail' ? '!bg-red-100 !border-red-200' : ''}
          `}
          style={{ width: sliderLeft }}
        />
      </div>
    </div>
  );
};
