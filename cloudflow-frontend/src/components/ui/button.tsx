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
      'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-white active:scale-[0.98]';

    let variantStyles = '';
    switch (variant) {
      case 'default':
        variantStyles =
          'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-md shadow-teal-500/20 hover:from-teal-600 hover:to-teal-700 hover:shadow-lg hover:shadow-teal-500/25';
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
          'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md shadow-red-500/20 hover:from-red-600 hover:to-red-700 hover:shadow-lg hover:shadow-red-500/25';
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
