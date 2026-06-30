import * as React from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'cf-control flex min-h-20 w-full rounded-md px-3 py-2 text-[13px] leading-5',
          className,
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
