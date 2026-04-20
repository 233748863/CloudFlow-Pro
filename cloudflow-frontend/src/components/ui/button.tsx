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
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ring-offset-white active:scale-[0.98] dark:ring-offset-slate-950';

    let variantStyles = '';
    switch (variant) {
      case 'default':
        variantStyles =
          'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-[0_12px_24px_rgba(13,148,136,0.22)] hover:from-cyan-500 hover:to-teal-500 dark:shadow-[0_12px_24px_rgba(6,182,212,0.18)]';
        break;
      case 'outline':
        variantStyles =
          'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white';
        break;
      case 'ghost':
        variantStyles =
          'bg-transparent text-slate-600 shadow-none hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';
        break;
      case 'link':
        variantStyles =
          'rounded-none px-0 text-cyan-600 shadow-none underline-offset-4 hover:underline dark:text-cyan-300';
        break;
      case 'secondary':
        variantStyles =
          'border border-slate-200 bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
        break;
      case 'destructive':
        variantStyles =
          'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-[0_12px_24px_rgba(220,38,38,0.2)] hover:from-red-500 hover:to-rose-500 dark:shadow-[0_12px_24px_rgba(225,29,72,0.18)]';
        break;
      case 'soft':
        variantStyles =
          'border border-cyan-100 bg-cyan-50 text-cyan-700 shadow-sm hover:border-cyan-200 hover:bg-cyan-100 dark:border-cyan-950/60 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/60';
        break;
      case 'contrast':
        variantStyles =
          'bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100';
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
