import { X } from 'lucide-react';
import { ModalOverlay } from '@/components/common';
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
    <ModalOverlay className="grid place-items-center bg-black/48 p-3 backdrop-blur-[2px] sm:p-4" closeOnClickOutside onClose={onClose}>
      <div
        aria-labelledby="auth-captcha-title"
        aria-describedby="auth-captcha-description"
        className="relative w-full max-w-[21.5rem] animate-fade-in"
      >
        <h2 id="auth-captcha-title" className="sr-only">
          {title}
        </h2>
        <p id="auth-captcha-description" className="sr-only">
          {description}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="no-min-size absolute -right-3 -top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:text-slate-200"
          aria-label="关闭验证弹层"
        >
          <X size={16} />
        </button>

        <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white p-3 shadow-[0_28px_70px_-30px_rgba(15,23,42,0.34)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_32px_72px_-32px_rgba(2,6,23,0.58)]">
          <SliderCaptcha onVerify={onVerify} width={320} height={160} />
        </div>
      </div>
    </ModalOverlay>
  );
};
