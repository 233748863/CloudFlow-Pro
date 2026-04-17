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
          'flex h-10 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm ring-offset-white transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50',
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
