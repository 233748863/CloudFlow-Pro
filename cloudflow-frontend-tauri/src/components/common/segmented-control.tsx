import React from 'react';
import { cn } from '@/utils/cn';

interface SegmentedControlProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface SegmentedControlItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: React.ReactNode;
  size?: 'default' | 'sm';
}

export const SegmentedControl = ({
  children,
  className,
  ...props
}: SegmentedControlProps) => (
  <div className={cn('cf-tabs', className)} role="tablist" {...props}>
    {children}
  </div>
);

export const SegmentedControlItem = React.forwardRef<
  HTMLButtonElement,
  SegmentedControlItemProps
>(({ active = false, count, size = 'default', className, children, type, ...props }, ref) => (
  <button
    ref={ref}
    type={type || 'button'}
    aria-pressed={active}
    className={cn(
      'cf-tab disabled:pointer-events-none disabled:opacity-50',
      size === 'sm' && 'cf-tab-sm',
      active && 'cf-tab-active',
      className,
    )}
    {...props}
  >
    {children}
    {count !== undefined && count !== null ? (
      <span className="cf-tab-count">{count}</span>
    ) : null}
  </button>
));

SegmentedControlItem.displayName = 'SegmentedControlItem';
