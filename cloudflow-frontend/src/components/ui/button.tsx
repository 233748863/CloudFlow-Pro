import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'secondary' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none ring-offset-background";
    
    let variantStyles = "";
    switch (variant) {
      case 'default':
        variantStyles = "bg-slate-900 text-white hover:bg-slate-900/90";
        break;
      case 'outline':
        variantStyles = "border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900";
        break;
      case 'ghost':
        variantStyles = "hover:bg-slate-100 hover:text-slate-900";
        break;
      case 'link':
        variantStyles = "underline-offset-4 hover:underline text-slate-900";
        break;
      case 'secondary':
        variantStyles = "bg-slate-100 text-slate-900 hover:bg-slate-100/80";
        break;
      case 'destructive':
        variantStyles = "bg-red-500 text-white hover:bg-red-500/90";
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
        className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
