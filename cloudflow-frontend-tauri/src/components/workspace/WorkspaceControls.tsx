import React from 'react';
import { Button, SegmentedControl, SegmentedControlItem } from '@/components/common';
import { cn } from '@/utils/cn';

interface WorkspaceControlGroupProps {
  children: React.ReactNode;
  className?: string;
}

interface WorkspaceIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  variant?: 'ghost' | 'outline';
  shape?: 'soft' | 'circle';
}

interface WorkspaceSegmentedItem<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface WorkspaceSegmentedControlProps<T extends string> {
  items: WorkspaceSegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export const WorkspaceControlGroup: React.FC<WorkspaceControlGroupProps> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      'inline-flex h-10 items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88',
      className,
    )}
  >
    {children}
  </div>
);

export const WorkspaceControlDivider: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('h-6 w-px bg-slate-200 dark:bg-slate-800', className)} />
);

export const WorkspaceIconButton: React.FC<WorkspaceIconButtonProps> = ({
  icon,
  label,
  variant = 'ghost',
  shape = 'soft',
  className,
  ...props
}) => (
  <Button
    type="button"
    variant={variant}
    size="icon"
    aria-label={label}
    title={label}
    className={cn(
      'h-10 w-10 text-slate-500 shadow-none hover:text-cyan-700',
      variant === 'outline'
        ? 'border border-slate-200 bg-white hover:border-cyan-100 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-950 dark:hover:bg-cyan-950/30'
        : 'border-0 bg-transparent hover:bg-cyan-50 dark:text-slate-300 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-200',
      shape === 'circle' ? 'rounded-full' : 'rounded-none',
      className,
    )}
    {...props}
  >
    {icon}
  </Button>
);

export function WorkspaceSegmentedControl<T extends string>({
  items,
  value,
  onChange,
  className,
}: WorkspaceSegmentedControlProps<T>) {
  return (
    <SegmentedControl className={cn('min-h-10', className)}>
      {items.map((item) => (
        <SegmentedControlItem
          key={item.value}
          active={item.value === value}
          onClick={() => onChange(item.value)}
          disabled={item.disabled}
          className={cn(item.disabled && 'cursor-not-allowed opacity-50')}
        >
          {item.icon}
          {item.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
