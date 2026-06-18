import * as React from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'cf-control flex min-h-24 w-full rounded-xl px-4 py-3 text-sm leading-6',
          className,
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
