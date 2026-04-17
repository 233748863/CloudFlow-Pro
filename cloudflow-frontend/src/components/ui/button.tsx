import React from 'react';
import { cn } from '@/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive'
    | 'soft'
    | 'contrast';
  size?: 'default' | 'sm' | 'lg' | 'xl' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className = '', variant = 'default', size = 'default', ...props },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ring-offset-white active:scale-[0.98]';

    let variantStyles = '';
    switch (variant) {
      case 'default':
        variantStyles =
          'bg-[linear-gradient(135deg,#0891b2,#0284c7)] text-white shadow-[0_12px_24px_rgba(14,165,233,0.22)] hover:brightness-[1.03]';
        break;
      case 'outline':
        variantStyles =
          'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900';
        break;
      case 'ghost':
        variantStyles =
          'bg-transparent text-slate-600 shadow-none hover:bg-slate-100 hover:text-slate-900';
        break;
      case 'link':
        variantStyles =
          'rounded-none px-0 text-teal-600 shadow-none underline-offset-4 hover:underline';
        break;
      case 'secondary':
        variantStyles =
          'border border-slate-200 bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200';
        break;
      case 'destructive':
        variantStyles =
          'bg-[linear-gradient(135deg,#ef4444,#dc2626)] text-white shadow-[0_12px_24px_rgba(239,68,68,0.22)] hover:brightness-[1.03]';
        break;
      case 'soft':
        variantStyles =
          'border border-cyan-100 bg-cyan-50 text-cyan-700 shadow-sm hover:border-cyan-200 hover:bg-cyan-100';
        break;
      case 'contrast':
        variantStyles =
          'bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)] hover:bg-slate-800';
        break;
    }

    let sizeStyles = '';
    switch (size) {
      case 'default':
        sizeStyles = 'h-10 px-4 py-2';
        break;
      case 'sm':
        sizeStyles = 'h-9 px-3 text-xs';
        break;
      case 'lg':
        sizeStyles = 'h-11 px-5';
        break;
      case 'xl':
        sizeStyles = 'h-12 px-6 text-sm';
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
