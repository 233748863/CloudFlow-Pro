import React from 'react';
import { cn } from '@/utils/cn';
import { Button } from './button';

type TableRowActionTone =
  | 'primary'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export interface TableRowActionItem {
  key?: React.Key;
  label: string;
  icon?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  hidden?: boolean;
  tone?: TableRowActionTone;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

interface TableRowActionsProps {
  actions: TableRowActionItem[];
  align?: 'start' | 'center' | 'end';
  wrap?: boolean;
  iconOnly?: boolean;
  className?: string;
  emptyText?: string;
}

const toneClassMap: Record<TableRowActionTone, string> = {
  primary:
    'text-slate-500 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-200',
  neutral:
    'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  success:
    'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-400 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-200',
  warning:
    'text-slate-500 hover:bg-amber-50 hover:text-amber-700 dark:text-slate-400 dark:hover:bg-amber-950/30 dark:hover:text-amber-200',
  danger:
    'text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-300',
  info:
    'text-slate-500 hover:bg-sky-50 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-sky-950/30 dark:hover:text-sky-200',
};

const alignClassMap: Record<NonNullable<TableRowActionsProps['align']>, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

export function TableRowActions({
  actions,
  align = 'start',
  wrap = false,
  iconOnly = false,
  className,
  emptyText = '-',
}: TableRowActionsProps) {
  const visibleActions = actions.filter((action) => !action.hidden);

  if (!visibleActions.length) {
    return <span className="text-sm text-slate-300">{emptyText}</span>;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        wrap && 'flex-wrap',
        alignClassMap[align],
        className,
      )}
    >
      {visibleActions.map((action, index) => (
        <Button
          key={action.key ?? `${action.label}-${index}`}
          type={action.type ?? 'button'}
          variant="ghost"
          size={iconOnly ? 'icon' : 'sm'}
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.title ?? action.label}
          aria-label={action.title ?? action.label}
          className={cn(
            iconOnly
              ? 'h-8 w-8 rounded-lg p-0 shadow-none'
              : 'gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-none',
            'disabled:bg-transparent disabled:text-slate-300 disabled:hover:bg-transparent',
            toneClassMap[action.tone ?? 'primary'],
            action.className,
          )}
        >
          {action.icon ? <span className="shrink-0">{action.icon}</span> : null}
          {iconOnly ? (
            <span className="sr-only">{action.label}</span>
          ) : (
            <span className="leading-none whitespace-nowrap">{action.label}</span>
          )}
        </Button>
      ))}
    </div>
  );
}
