import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  X,
} from 'lucide-react';
import {
  dismissToast,
  getToastSnapshot,
  subscribeToToasts,
  type ToastType,
} from '@/lib/toastStore';
import './toast.css';

function getIcon(type: ToastType) {
  switch (type) {
    case 'success':
      return <CircleCheck className="cf-toast__icon cf-toast__icon--success" aria-hidden="true" />;
    case 'error':
      return <CircleX className="cf-toast__icon cf-toast__icon--error" aria-hidden="true" />;
    case 'warning':
      return <CircleAlert className="cf-toast__icon cf-toast__icon--warning" aria-hidden="true" />;
    case 'info':
    default:
      return <Info className="cf-toast__icon cf-toast__icon--info" aria-hidden="true" />;
  }
}

export function ToastViewport() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToastSnapshot, getToastSnapshot);

  if (typeof document === 'undefined' || toasts.length === 0) {
    return null;
  }

  return createPortal(
    <div className="cf-toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={[
            'cf-toast',
            `cf-toast--${toast.type}`,
            toast.removing ? 'cf-toast--leaving' : 'cf-toast--entering',
          ].join(' ')}
        >
          <div className="cf-toast__body">
            <div className="cf-toast__row">
              <div className="cf-toast__icon-wrap">{getIcon(toast.type)}</div>

              <div className="cf-toast__content">
                {toast.title ? <p className="cf-toast__title">{toast.title}</p> : null}
                <p className={toast.title ? 'cf-toast__message cf-toast__message--subtle' : 'cf-toast__message'}>
                  {toast.message}
                </p>
                {toast.action ? (
                  <button
                    type="button"
                    className="cf-toast__action"
                    onClick={() => {
                      toast.action?.onClick?.();
                      dismissToast(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className="cf-toast__close"
                aria-label="关闭提示"
                onClick={() => dismissToast(toast.id)}
              >
                <X className="cf-toast__close-icon" aria-hidden="true" />
              </button>
            </div>
          </div>

          {toast.duration ? (
            <div className="cf-toast__progress-track">
              <div
                className={`cf-toast__progress cf-toast__progress--${toast.type}`}
                style={{ animationDuration: `${toast.duration}ms` }}
              />
            </div>
          ) : null}
        </article>
      ))}
    </div>,
    document.body,
  );
}

