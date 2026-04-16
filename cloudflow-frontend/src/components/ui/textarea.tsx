import * as React from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'cf-glass-input flex min-h-[96px] w-full rounded-[24px] px-3.5 py-3 text-sm text-slate-700 ring-offset-white transition-all placeholder:text-slate-400 hover:border-pink-100 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:ring-offset-1 focus:border-white/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/80',
          className,
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
