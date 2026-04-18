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
  primary: 'border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800',
  neutral: 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
  success: 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800',
  warning: 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800',
  danger: 'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700',
  info: 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800',
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
              ? 'h-8 w-8 rounded-full p-0 shadow-none'
              : 'h-8 gap-1 rounded-full px-2.5 text-xs font-medium shadow-none',
            'focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2',
            'disabled:bg-transparent disabled:text-slate-300 disabled:ring-0 disabled:hover:bg-transparent',
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
