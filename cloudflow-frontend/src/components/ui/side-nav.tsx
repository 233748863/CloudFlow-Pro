import React from 'react';
import { cn } from '@/utils/cn';

interface SideNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: 'default' | 'sm';
}

export const SideNavItem = React.forwardRef<HTMLButtonElement, SideNavItemProps>(
  ({ active = false, size = 'default', className, children, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type || 'button'}
      className={cn(
        'cf-side-link',
        size === 'sm' && 'cf-side-link-sm',
        active && 'cf-side-link-active',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);

SideNavItem.displayName = 'SideNavItem';
