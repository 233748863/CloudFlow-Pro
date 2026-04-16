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
          'cf-glass-input flex h-11 w-full rounded-2xl px-3.5 py-2 text-sm text-slate-700 ring-offset-white transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 hover:border-pink-100 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:ring-offset-1 focus:border-white/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/80',
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
