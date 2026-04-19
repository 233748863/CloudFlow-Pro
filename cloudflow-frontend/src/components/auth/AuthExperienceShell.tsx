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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-[344px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_22px_44px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/80 sm:p-6">

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">
            <ShieldCheck size={14} />
            安全验证
          </div>

          <h3 className="mt-4 text-[1.45rem] font-bold tracking-tight text-slate-900">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>

          <div className="mt-6">
            <SliderCaptcha onVerify={onVerify} width={300} />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500">
            <span>完成拼图验证后继续下一步</span>
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
