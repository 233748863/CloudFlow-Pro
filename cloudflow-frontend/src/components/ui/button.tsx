import React from 'react';
import { cn } from '@/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'secondary' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-white active:scale-[0.98]";
    
    let variantStyles = "";
    switch (variant) {
      case 'default':
        variantStyles = "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm";
        break;
      case 'outline':
        variantStyles = "border border-slate-200 bg-white hover:bg-slate-50 hover:text-indigo-600 shadow-sm";
        break;
      case 'ghost':
        variantStyles = "hover:bg-slate-50 hover:text-indigo-600 text-slate-700";
        break;
      case 'link':
        variantStyles = "underline-offset-4 hover:underline text-indigo-600";
        break;
      case 'secondary':
        variantStyles = "bg-indigo-50 text-indigo-700 hover:bg-indigo-100";
        break;
      case 'destructive':
        variantStyles = "bg-red-500 text-white hover:bg-red-600 shadow-sm";
        break;
    }

    let sizeStyles = "";
    switch (size) {
      case 'default':
        sizeStyles = "h-10 py-2 px-4";
        break;
      case 'sm':
        sizeStyles = "h-9 px-3 rounded-md";
        break;
      case 'lg':
        sizeStyles = "h-11 px-8 rounded-md";
        break;
      case 'icon':
        sizeStyles = "h-10 w-10";
        break;
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles, sizeStyles, className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button }
export type { ButtonProps }
