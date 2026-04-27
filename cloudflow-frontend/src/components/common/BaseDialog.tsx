import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { lockBodyScroll } from '@/utils/bodyScrollLock';

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
  const hasCustomBodyOverflow = Boolean(bodyClassName && /(^|\s)!?overflow(?:-[xy])?-/.test(bodyClassName));

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

    const unlockBodyScroll = lockBodyScroll();
    window.addEventListener('keydown', handleEscape);
    window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    });

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleEscape);
      previousActiveElementRef.current?.focus?.();
      previousActiveElementRef.current = null;
    };
  }, [closeOnEscape, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/48 p-2 backdrop-blur-sm sm:p-4"
      style={zIndex === 50 ? undefined : { zIndex }}
      onClick={() => {
        if (closeOnClickOutside) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        className={cn(
          'w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/80 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800/80 dark:shadow-[0_28px_56px_rgba(2,6,23,0.56)]',
          'flex flex-col',
          !hasCustomPanelMaxHeight && 'max-h-[95vh] sm:max-h-[90vh]',
          resolvedMaxWidthClassName,
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h3 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            {description ? (
              <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {description}
              </div>
            ) : null}
          </div>
          <div className="ml-4 flex items-center gap-2">
            {headerAside}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="关闭弹窗"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 px-4 py-3 sm:px-6 sm:py-4',
            !hasCustomBodyOverflow && 'overflow-y-auto',
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              'flex flex-shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-6 sm:py-4 dark:border-slate-800 dark:bg-slate-900/70',
              footerClassName,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};
