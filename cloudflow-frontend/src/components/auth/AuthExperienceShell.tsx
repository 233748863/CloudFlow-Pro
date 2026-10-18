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
    <ModalOverlay
      className="cf-auth-captcha-overlay"
      closeOnClickOutside
      onClose={onClose}
    >
      <div
        aria-labelledby="auth-captcha-title"
        aria-describedby="auth-captcha-description"
        className="cf-auth-captcha-shell"
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
          className="cf-auth-captcha-close"
          aria-label="关闭验证弹层"
        >
          <X size={16} />
        </button>

        <div className="cf-auth-captcha-card">
          <SliderCaptcha onVerify={onVerify} width={320} height={160} />
        </div>
      </div>
    </ModalOverlay>
  );
};
