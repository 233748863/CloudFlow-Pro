import React from 'react';
import { Button } from '@/components/ui';
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
      'inline-flex h-11 items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
      className,
    )}
  >
    {children}
  </div>
);

export const WorkspaceControlDivider: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('h-6 w-px bg-slate-200', className)} />
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
      'h-11 w-11 text-slate-500 shadow-none hover:text-cyan-700',
      variant === 'outline'
        ? 'border border-slate-200 bg-white hover:border-cyan-100 hover:bg-cyan-50'
        : 'border-0 bg-transparent hover:bg-cyan-50',
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
    <div
      className={cn(
        'inline-flex h-11 items-center rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            disabled={item.disabled}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
              active
                ? 'bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-100'
                : 'text-slate-500 hover:text-slate-700',
              item.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
