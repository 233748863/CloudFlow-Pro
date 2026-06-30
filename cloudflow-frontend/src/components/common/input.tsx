import React from 'react';
import { cn } from '@/utils/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'cf-control flex h-9 min-h-9 w-full rounded-md px-3 py-1.5 text-[13px] file:border-0 file:bg-transparent file:text-[13px] file:font-medium',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
