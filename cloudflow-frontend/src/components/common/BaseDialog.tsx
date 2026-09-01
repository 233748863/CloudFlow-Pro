import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { ModalOverlay } from '@/components/common/ModalOverlay';

export type BaseDialogWidth = 'narrow' | 'normal' | 'wide' | 'extra-wide' | 'full';

interface BaseDialogProps {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: BaseDialogWidth;
  maxWidthClassName?: string;
  headerAside?: React.ReactNode;
  bodyClassName?: string;
  footerClassName?: string;
  panelClassName?: string;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  hideCloseButton?: boolean;
  zIndex?: number;
}

export const BaseDialog: React.FC<BaseDialogProps> = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 'normal',
  maxWidthClassName,
  headerAside,
  bodyClassName,
  footerClassName,
  panelClassName,
  closeOnClickOutside = false,
  closeOnEscape = true,
  hideCloseButton = false,
  zIndex = 50,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const widthClassMap: Record<BaseDialogWidth, string> = {
    narrow: 'max-w-md',
    normal: 'max-w-lg',
    wide: 'w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl',
    'extra-wide': 'w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl',
    full: 'w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl',
  };
  const resolvedMaxWidthClassName = maxWidthClassName || widthClassMap[width];
  const hasCustomPanelMaxHeight = Boolean(panelClassName && /(^|\s)!?max-h-/.test(panelClassName));
  const hasCustomBodyOverflow = Boolean(
    bodyClassName && /(^|\s)!?overflow(?:-[xy])?-(auto|scroll|hidden|clip)(\s|$)/.test(bodyClassName),
  );
  const useDefaultScrollBody = !hasCustomBodyOverflow;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const handleEscape = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleEscape);
    window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    });

    return () => {
      window.removeEventListener('keydown', handleEscape);
      previousActiveElementRef.current?.focus?.();
      previousActiveElementRef.current = null;
    };
  }, [closeOnEscape, open]);

  if (!open) {
    return null;
  }

  return (
    <ModalOverlay
      closeOnClickOutside={closeOnClickOutside}
      closeOnEscape={false}
      onClose={onClose}
      zIndex={zIndex}
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        className={cn(
          'modal-content card min-w-0 w-full !overflow-hidden',
          'cf-dialog-panel flex flex-col',
          !hasCustomPanelMaxHeight && 'max-h-[95vh] sm:max-h-[90vh]',
          resolvedMaxWidthClassName,
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header p-4 admin-source-section-head flex flex-shrink-0 items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h3 id={titleId} className="modal-title text-sm font-semibold text-cf-title">
              {title}
            </h3>
            {description ? (
              <div className="mt-1 text-xs leading-6 text-cf-subtle">
                {description}
              </div>
            ) : null}
          </div>
          <div className="ml-4 flex items-center gap-2">
            {headerAside}
            {hideCloseButton ? null : (
              <button
                type="button"
                onClick={onClose}
                className="modal-close rounded-md p-2 text-cf-faint transition-colors hover:bg-[var(--cf-surface-muted)] hover:text-cf-body dark:hover:bg-slate-800"
                aria-label="关闭弹窗"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
        <div
          className={cn(
            'modal-body p-4 cf-dialog-body min-h-0 flex-1 overscroll-contain',
            bodyClassName,
            useDefaultScrollBody && 'cf-dialog-scroll-body',
            !hasCustomBodyOverflow && '!overflow-y-auto',
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              'p-4 flex flex-shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-900/70',
              'modal-footer cf-dialog-footer',
              footerClassName,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </ModalOverlay>
  );
};
