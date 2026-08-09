import React from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/common';

interface DeployActionButtonProps {
  label: string;
  icon?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}

export const DeployActionButton: React.FC<DeployActionButtonProps> = ({
  label,
  icon,
  onClick,
  danger = false,
  disabled = false,
  className,
}) => (
  <Button
    type="button"
    onClick={onClick}
    disabled={disabled}
    variant="ghost"
    size="sm"
    className={cn(
      'gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-none',
      'disabled:bg-transparent disabled:text-slate-300 disabled:hover:bg-transparent dark:disabled:text-slate-600',
      danger
        ? 'text-cf-subtle hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
        : 'text-cf-subtle hover:bg-[var(--cf-surface-muted)] hover:text-cf-title dark:hover:bg-slate-800',
      className,
    )}
  >
    {icon ? <span className="shrink-0">{icon}</span> : null}
    <span className="leading-none whitespace-nowrap">{label}</span>
  </Button>
);
