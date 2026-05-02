import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';
import { lockBodyScroll } from '@/utils/bodyScrollLock';

interface ModalOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  onClose?: () => void;
  zIndex?: number;
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
  ...props
}) => {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const unlockBodyScroll = lockScroll ? lockBodyScroll() : undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        onCloseRef.current?.();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      unlockBodyScroll?.();
      window.removeEventListener('keydown', handleEscape);
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
      className={cn(
        'fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/48 p-2 backdrop-blur-sm sm:p-4',
        className,
      )}
      role={role}
      aria-modal={role === 'dialog' ? true : undefined}
      style={zIndex === 50 ? style : { ...style, zIndex }}
      onClick={handleClick}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
};
