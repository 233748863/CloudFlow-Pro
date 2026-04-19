import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface BaseDialogProps {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClassName?: string;
  headerAside?: React.ReactNode;
  bodyClassName?: string;
  footerClassName?: string;
  panelClassName?: string;
  closeOnClickOutside?: boolean;
}

export const BaseDialog: React.FC<BaseDialogProps> = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-lg',
  headerAside,
  bodyClassName,
  footerClassName,
  panelClassName,
  closeOnClickOutside = true,
}) => {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
      onClick={() => {
        if (closeOnClickOutside) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div
        className={cn(
          'w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/80',
          maxWidthClassName,
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {description ? <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div> : null}
          </div>
          <div className="ml-4 flex items-center gap-2">
            {headerAside}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="关闭弹窗"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={cn('px-5 py-5', bodyClassName)}>{children}</div>
        {footer ? (
          <div className={cn('border-t border-slate-100 bg-slate-50/70 px-5 py-4', footerClassName)}>{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};
