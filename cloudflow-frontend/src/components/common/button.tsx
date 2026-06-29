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
    | 'warning'
    | 'success'
    | 'soft';
  size?: 'default' | 'sm' | 'lg' | 'xl' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className = '', variant = 'default', size = 'default', ...props },
    ref,
  ) => {
    const baseStyles = 'btn';

    let variantStyles = '';
    switch (variant) {
      case 'default':
        variantStyles = 'btn-primary';
        break;
      case 'outline':
        variantStyles = 'btn-secondary';
        break;
      case 'ghost':
        variantStyles = 'btn-ghost';
        break;
      case 'link':
        variantStyles =
          '!rounded-none !border-transparent !bg-transparent !px-0 !py-0 !text-[#0d95b5] !shadow-none underline-offset-4 hover:!bg-transparent hover:!text-[#0b7894] hover:underline dark:!text-cyan-200 dark:hover:!text-cyan-100';
        break;
      case 'secondary':
        variantStyles = 'btn-secondary';
        break;
      case 'destructive':
        variantStyles = 'btn-danger';
        break;
      case 'warning':
        variantStyles = 'btn-warning';
        break;
      case 'success':
        variantStyles = 'btn-success';
        break;
      case 'soft':
        variantStyles = 'btn-soft';
        break;
    }

    let sizeStyles = '';
    switch (size) {
      case 'default':
        sizeStyles = 'btn-md';
        break;
      case 'sm':
        sizeStyles = 'btn-sm';
        break;
      case 'lg':
        sizeStyles = 'btn-lg';
        break;
      case 'xl':
        sizeStyles = 'btn-xl';
        break;
      case 'icon':
        sizeStyles = 'btn-icon';
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
