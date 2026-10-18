import React from 'react';
import { cn } from '@/utils/cn';

interface MobileListCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'article' | 'tr';
  heading?: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
}

export const MobileListCard = React.forwardRef<HTMLElement, MobileListCardProps>(
  ({ as = 'article', heading, description, aside, footer, className, children, ...props }, ref) => {
    const content = as === 'tr' ? children : (
      <>
        {heading || aside ? <header className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-semibold text-cf-title">{heading}</h2>{aside}</header> : null}
        {description ? <div className="text-xs text-cf-subtle">{description}</div> : null}
        {children}
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--cf-border)] pt-3">{footer}</footer> : null}
      </>
    );
    return React.createElement(as, { ...props, ref, className: cn('cf-mobile-list-card', className) }, content);
  },
);

MobileListCard.displayName = 'MobileListCard';
