import React from 'react';
import { cn } from '@/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className = '', variant = 'default', size = 'default', ...props },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium tracking-[0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-white active:scale-[0.985]';

    let variantStyles = '';
    switch (variant) {
      case 'default':
        variantStyles =
          'bg-[#14b8a6] text-white shadow-[0_10px_24px_rgba(20,184,166,0.22)] hover:bg-[#0f9f91] hover:shadow-[0_14px_28px_rgba(20,184,166,0.26)]';
        break;
      case 'outline':
        variantStyles =
          'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50/40';
        break;
      case 'ghost':
        variantStyles =
          'bg-transparent text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-900';
        break;
      case 'link':
        variantStyles =
          'rounded-none px-0 text-emerald-600 shadow-none underline-offset-4 hover:underline';
        break;
      case 'secondary':
        variantStyles =
          'border border-amber-200 bg-amber-50 text-amber-700 shadow-sm hover:bg-amber-100';
        break;
      case 'destructive':
        variantStyles =
          'bg-[#ef4444] text-white shadow-[0_10px_24px_rgba(239,68,68,0.2)] hover:bg-[#dc2626] hover:shadow-[0_14px_28px_rgba(239,68,68,0.24)]';
        break;
    }

    let sizeStyles = '';
    switch (size) {
      case 'default':
        sizeStyles = 'h-10 px-4 py-2';
        break;
      case 'sm':
        sizeStyles = 'h-9 px-3.5 text-sm';
        break;
      case 'lg':
        sizeStyles = 'h-11 px-6 text-base';
        break;
      case 'icon':
        sizeStyles = 'h-10 w-10 p-0';
        break;
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles, sizeStyles, className)}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
