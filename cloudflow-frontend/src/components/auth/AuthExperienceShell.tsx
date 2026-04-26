import React, { useEffect } from 'react';
import { ShieldCheck, X } from 'lucide-react';
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
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-slate-950/42 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[24rem] overflow-hidden rounded-[1.75rem] border border-slate-200/85 bg-white/94 p-6 shadow-[0_28px_56px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-dark-700 dark:bg-dark-900/94 dark:shadow-[0_32px_64px_rgba(2,6,23,0.48)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:bg-dark-800 dark:text-slate-400 dark:hover:bg-dark-700 dark:hover:text-slate-100"
          aria-label="关闭验证弹层"
        >
          <X size={16} />
        </button>

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/35 dark:text-teal-200">
            <ShieldCheck size={14} />
            安全验证
          </div>

          <h3 className="mt-4 text-[1.45rem] font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>

          <div className="mt-6">
            <SliderCaptcha onVerify={onVerify} width={300} height={150} />
          </div>

          <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            验证通过后将自动继续当前流程
          </p>
        </div>
      </div>
    </div>
  );
};
