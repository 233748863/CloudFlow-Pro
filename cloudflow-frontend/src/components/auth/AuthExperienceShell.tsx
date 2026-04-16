import React from 'react';
import { ArrowRight, ShieldCheck, X } from 'lucide-react';
import { SliderCaptcha } from '@/components/SliderCaptcha';

interface AuthCaptchaDialogProps {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onVerify: (token: string) => void;
}

export const AuthCaptchaDialog: React.FC<AuthCaptchaDialogProps> = ({
  open,
  title,
  description,
  onClose,
  onVerify,
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/22 px-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-[360px] overflow-hidden rounded-[26px] border border-white/85 bg-white/96 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:p-7">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(20,184,166,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.03)_1px,transparent_1px)] bg-[size:28px_28px] opacity-40" />
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_center,rgba(20,184,166,0.12),transparent_70%)]" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:text-slate-700"
        >
          <X size={16} />
        </button>

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <ShieldCheck size={14} />
            安全验证
          </div>

          <h3 className="mt-4 text-[1.7rem] font-extrabold tracking-tight text-slate-900">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>

          {/* 验证弹层沿用认证页单卡片结构，避免跳出当前认证流程的视觉上下文。 */}
          <div className="mt-6">
            <SliderCaptcha onVerify={onVerify} width={300} />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <span>完成滑块拼图后继续下一步</span>
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
              下一步
              <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
