import * as React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`
          flex min-h-[80px] w-full rounded-md border border-slate-200
          bg-white px-3 py-2 text-sm ring-offset-white transition-all
          placeholder:text-slate-400
          hover:border-pink-300
          focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-1 focus:border-slate-200
          disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200
          ${className}
        `}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
