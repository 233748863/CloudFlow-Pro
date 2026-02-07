import React, { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getCaptcha, checkCaptcha } from '@/services/api/auth';
import { useMount } from '@/hooks/useMount';
import { SLIDER_WIDTH, SLIDER_DEFAULT_WIDTH, SLIDER_DEFAULT_HEIGHT, SLIDER_KEYBOARD_STEP } from '@/constants/ui';
import { logger } from '@/utils/logger';

/**
 * 滑块验证码组件属性
 */
interface SliderCaptchaProps {
  /** 验证成功回调，返回验证 token */
  onVerify: (token: string) => void;
  /** 验证码宽度，默认 300px */
  width?: number;
  /** 验证码高度，默认 150px */
  height?: number;
}

/**
 * 滑块验证码组件
 * 支持鼠标、触摸和键盘操作
 * 
 * @example
 * ```tsx
 * <SliderCaptcha 
 *   onVerify={(token) => console.log(token)}
 *   width={300}
 *   height={150}
 * />
 * ```
 */
export const SliderCaptcha: React.FC<SliderCaptchaProps> = ({ 
  onVerify, 
  width = SLIDER_DEFAULT_WIDTH, 
  height = SLIDER_DEFAULT_HEIGHT 
}) => {
  const [loading, setLoading] = useState(true);
  const [captchaData, setCaptchaData] = useState<any>(null);
  const [sliderLeft, setSliderLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'fail'>('idle');
  
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleMove = (clientX: number) => {
    if (!isDragging || !containerRef.current) return;
    const diff = clientX - startX;
    // Limit range
    const max = width - SLIDER_WIDTH;
    let newLeft = Math.max(0, Math.min(max, diff));
    setSliderLeft(newLeft);
  };

  const handleEnd = async () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    // Verify
    setStatus('verifying');
    try {
      const res = await checkCaptcha({
        uuid: captchaData.uuid,
        x: Math.round(sliderLeft)
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
  const onMouseLeave = () => handleEnd();

  // Touch Events
  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);
  const onTouchEnd = () => handleEnd();

  // Keyboard Events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (status === 'success' || status === 'verifying') return;
    
    const max = width - SLIDER_WIDTH;
    
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

  return (
    <div className="w-full select-none" style={{ width }} onMouseLeave={onMouseLeave}>
      {/* Image Area */}
      <div className="relative overflow-hidden rounded-t-lg bg-slate-100 border border-slate-200" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-20">
            <Loader2 className="animate-spin text-slate-400" />
          </div>
        )}
        
        {/* Status Overlay */}
        {status === 'success' && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/20 z-30 backdrop-blur-[2px] transition-all">
               <CheckCircle2 className="text-emerald-500 w-10 h-10 mb-2" />
               <span className="text-emerald-600 font-bold text-sm">验证通过</span>
           </div>
        )}
        {status === 'fail' && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/20 z-30 backdrop-blur-[2px] transition-all">
               <XCircle className="text-red-500 w-10 h-10 mb-2" />
               <span className="text-red-600 font-bold text-sm">验证失败</span>
           </div>
        )}

        {/* Refresh Button */}
        <button 
           onClick={(e) => { e.preventDefault(); fetchCaptcha(); }}
           className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-white rounded-full shadow-sm z-30 text-slate-600 transition-colors"
           title="刷新验证码"
        >
           <RefreshCw size={14} />
        </button>

        {captchaData && (
          <>
            <img 
              src={captchaData.bgImage} 
              alt="bg" 
              className="absolute top-0 left-0 w-full h-full object-cover" 
              draggable={false}
            />
            <img 
              src={captchaData.sliderImage} 
              alt="slider" 
              className="absolute w-[50px] h-[50px] z-10 shadow-[0_0_10px_rgba(0,0,0,0.5)]"
              style={{ 
                top: captchaData.y, 
                left: sliderLeft 
              }} 
              draggable={false}
            />
          </>
        )}
      </div>

      {/* Track Area */}
      <div 
        ref={containerRef}
        className="relative h-10 bg-slate-100 rounded-b-lg border-x border-b border-slate-200 mt-[-1px] flex items-center px-2"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={width - SLIDER_WIDTH}
        aria-valuenow={sliderLeft}
        aria-label="拖动滑块完成验证，也可使用方向键操作"
      >
        <div className="text-xs text-slate-400 w-full text-center select-none">向右拖动滑块填充拼图</div>
        
        {/* Slider Button */}
        <div 
          className={`absolute top-0 h-10 flex items-center justify-center cursor-pointer shadow-sm border border-slate-200 transition-colors z-20
            ${isDragging ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white hover:bg-slate-50 text-slate-500'}
            ${status === 'success' ? '!bg-emerald-500 !border-emerald-500 !text-white' : ''}
            ${status === 'fail' ? '!bg-red-500 !border-red-500 !text-white' : ''}
          `}
          style={{ left: sliderLeft, width: SLIDER_WIDTH }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          <div className="w-1 h-3 rounded-full bg-current opacity-50 mx-[1px]" />
          <div className="w-1 h-3 rounded-full bg-current opacity-50 mx-[1px]" />
        </div>
        
        {/* Progress Bar */}
        <div 
          className={`absolute top-0 left-0 h-full bg-indigo-100 border-y border-indigo-200/50 transition-all rounded-bl-lg
            ${status === 'success' ? '!bg-emerald-100 !border-emerald-200' : ''}
            ${status === 'fail' ? '!bg-red-100 !border-red-200' : ''}
          `}
          style={{ width: sliderLeft }}
        />
      </div>
    </div>
  );
};
