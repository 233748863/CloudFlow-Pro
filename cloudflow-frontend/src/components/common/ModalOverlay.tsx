import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';
import { lockBodyScroll } from '@/utils/bodyScrollLock';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

const modalStack: HTMLDivElement[] = [];

interface ModalOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  onClose?: () => void;
  zIndex?: number;
  mobileFullScreen?: boolean;
}

export const ModalOverlay: React.FC<ModalOverlayProps> = ({
  children,
  className,
  closeOnClickOutside = false,
  closeOnEscape = true,
  lockScroll = true,
  onClick,
  onClose,
  role = 'dialog',
  style,
  zIndex = 50,
  mobileFullScreen = true,
  ...props
}) => {
  const onCloseRef = useRef(onClose);
  const overlayRef = useRef<HTMLDivElement>(null);
  const breakpoint = useBreakpoint();
  const { keyboardHeight } = useKeyboardHeight();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalStack.push(overlay);
    const unlockBodyScroll = lockScroll ? lockBodyScroll() : undefined;

    const getFocusable = () => Array.from(overlay.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);

    const handleEscape = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== overlay || event.defaultPrevented) return;
      const focusedPanel = document.activeElement?.closest('[role="dialog"], [role="listbox"]');
      if (focusedPanel && focusedPanel !== overlay && !overlay.contains(focusedPanel)) return;
      if (closeOnEscape && event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
      }
      if (event.key === 'Tab') {
        const elements = getFocusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          overlay.focus();
        } else if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    const frame = window.requestAnimationFrame(() => {
      if (modalStack.at(-1) !== overlay) return;
      (overlay.querySelector<HTMLElement>('[data-autofocus]') || getFocusable()[0] || overlay).focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const wasTop = modalStack.at(-1) === overlay;
      const index = modalStack.indexOf(overlay);
      if (index >= 0) modalStack.splice(index, 1);
      unlockBodyScroll?.();
      window.removeEventListener('keydown', handleEscape);
      if (wasTop && previousFocus?.isConnected) previousFocus.focus();
    };
  }, [closeOnEscape, lockScroll]);

  if (typeof document === 'undefined') {
    return null;
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(event);

    if (
      closeOnClickOutside &&
      !event.defaultPrevented &&
      event.target === event.currentTarget
    ) {
      onCloseRef.current?.();
    }
  };

  return createPortal(
    <div
      ref={overlayRef}
      tabIndex={-1}
      className={cn(
        'modal-overlay fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/48 p-2 sm:p-4',
        className,
        mobileFullScreen && 'cf-modal-fullscreen',
      )}
      role={role}
      aria-modal={role === 'dialog' ? true : undefined}
      style={{ ...style, ...(zIndex !== 50 ? { zIndex } : {}), '--cf-keyboard-height': `${breakpoint === 'mobile' ? keyboardHeight : 0}px` } as React.CSSProperties}
      onClick={handleClick}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
};
