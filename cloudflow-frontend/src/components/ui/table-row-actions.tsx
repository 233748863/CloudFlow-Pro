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

// 以固定资产页为基准：操作区统一使用“轻量文字按钮 + hover 背景”的风格。
const toneClassMap: Record<TableRowActionTone, string> = {
  primary: 'text-pink-500 hover:text-pink-600 hover:bg-pink-50',
  neutral: 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
  success: 'text-green-600 hover:text-green-700 hover:bg-green-50',
  warning: 'text-amber-600 hover:text-amber-700 hover:bg-amber-50',
  danger: 'text-red-500 hover:text-red-600 hover:bg-red-50',
  info: 'text-blue-500 hover:text-blue-700 hover:bg-blue-50',
};

const alignClassMap: Record<NonNullable<TableRowActionsProps['align']>, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

// 页面只声明动作语义，具体视觉统一由该组件收口，后续整体改版只改这里。
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
        'flex items-center gap-1',
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
              ? 'h-8 w-8 rounded-md p-0 shadow-none'
              : 'h-8 px-2 text-sm font-medium gap-1 rounded-md shadow-none',
            'focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2',
            'disabled:bg-transparent disabled:text-slate-300 disabled:hover:bg-transparent',
            toneClassMap[action.tone ?? 'primary'],
            action.className,
          )}
        >
          {/* iconOnly 适合公告管理这类动作较多、但列宽有限的表格。 */}
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
