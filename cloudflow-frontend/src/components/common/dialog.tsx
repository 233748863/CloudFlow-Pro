import React, { useState } from 'react';
import { X } from 'lucide-react';

import { ModalOverlay } from '@/components/common/ModalOverlay';
import { cn } from '@/utils/cn';

const DialogContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({
  open: false,
  onOpenChange: () => {},
});

export const Dialog = ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;
  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  return (
    <DialogContext.Provider value={{ open: !!isOpen, onOpenChange: handleOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
};

export const DialogTrigger = ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
  const { onOpenChange } = React.useContext(DialogContext);
  const handleClick = () => onOpenChange(true);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: any) => {
        (children.props as any).onClick?.(e);
        handleClick();
      },
    });
  }

  return <button onClick={handleClick}>{children}</button>;
};

export const DialogContent = ({
  children,
  className = '',
  disableDefaultMaxWidth = false,
}: {
  children: React.ReactNode;
  className?: string;
  disableDefaultMaxWidth?: boolean;
}) => {
  const { open, onOpenChange } = React.useContext(DialogContext);

  if (!open) return null;

  return (
    <ModalOverlay
      className="items-start justify-center bg-slate-950/48 p-3 sm:items-center sm:p-4"
      closeOnClickOutside
      onClose={() => onOpenChange(false)}
    >
      <div
        className={cn(
          'modal-content cf-dialog-panel relative z-10 grid w-full max-h-[95vh] gap-4 overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-4 shadow-none sm:max-h-[90vh] md:w-full dark:border-slate-800 dark:bg-slate-950',
          !disableDefaultMaxWidth && 'sm:max-w-lg',
          className
        )}
      >
        {children}
        <button
          className="modal-close absolute right-3 top-3 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-2 text-slate-400 transition-colors hover:bg-[var(--cf-surface-muted)] hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
          onClick={() => onOpenChange(false)}
        >
          <span className="sr-only">关闭</span>
          <X className="h-4 w-4" />
        </button>
      </div>
    </ModalOverlay>
  );
};

export const DialogHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'modal-header cf-dialog-header sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-1.5 border-b border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 pr-12 text-center sm:text-left dark:border-slate-800 dark:bg-slate-950',
      className,
    )}
    {...props}
  />
);

export const DialogTitle = ({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('modal-title text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100', className)} {...props} />
);

export const DialogDescription = ({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-xs leading-5 text-slate-500 dark:text-slate-400', className)} {...props} />
);

export const DialogFooter = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'modal-footer cf-dialog-footer sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 sm:flex-row sm:justify-end dark:border-slate-800 dark:bg-slate-900/95',
      className,
    )}
    {...props}
  />
);
