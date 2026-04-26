import React from 'react';
import { cn } from '@/utils/cn';

interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ active = false, className, children, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type || 'button'}
      className={cn('cf-filter-chip', active && 'cf-filter-chip-active', className)}
      {...props}
    >
      {children}
    </button>
  ),
);

FilterChip.displayName = 'FilterChip';
