import React from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui';

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
      'gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-none',
      'disabled:bg-transparent disabled:text-slate-300 disabled:hover:bg-transparent dark:disabled:text-slate-600',
      danger
        ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
      className,
    )}
  >
    {icon ? <span className="shrink-0">{icon}</span> : null}
    <span className="leading-none whitespace-nowrap">{label}</span>
  </Button>
);
