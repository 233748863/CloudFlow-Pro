import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { TableCell, TableRow } from '@/components/ui/table';

export const WorkspaceBackdrop: React.FC = () => (
  <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden bg-[#f7faf8]">
    <div className="absolute left-[-8%] top-[-10%] h-[26rem] w-[26rem] rounded-full bg-emerald-100/55 blur-[120px]" />
    <div className="absolute right-[-10%] top-[10%] h-[30rem] w-[30rem] rounded-full bg-cyan-100/45 blur-[140px]" />
    <div className="absolute bottom-[-16%] left-[28%] h-[22rem] w-[22rem] rounded-full bg-sky-100/45 blur-[120px]" />
    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,250,248,0.92),rgba(247,250,248,0.98))]" />
  </div>
);

export const WorkspaceSectionHeader = ({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {eyebrow}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{title}</div>
    </div>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition hover:text-emerald-600"
      >
        {actionLabel}
        <ChevronRight size={14} />
      </button>
    ) : null}
  </div>
);

export const WorkspaceEmptyPanel = ({
  icon,
  title,
  description,
  variant = 'default',
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  variant?: 'default' | 'glass';
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-[24px] px-6 py-14 text-center ${
      variant === 'glass'
        ? 'border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]'
        : 'border border-dashed border-slate-200 bg-slate-50'
    }`}
  >
    <div
      className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-slate-300 ${
        variant === 'glass' ? 'bg-slate-50 text-slate-400' : 'bg-white shadow-sm'
      }`}
    >
      {icon}
    </div>
    <div className="text-sm font-semibold text-slate-700">{title}</div>
    <div className="mt-2 max-w-xs text-xs leading-6 text-slate-400">{description}</div>
  </div>
);

export const WorkspaceStatusPanel = ({
  icon,
  title,
  description,
  actions,
  className,
  iconWrapClassName,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  iconWrapClassName?: string;
}) => (
  <div
    className={cn(
      'overflow-hidden rounded-[28px] border border-slate-200 bg-white px-8 py-10 text-center shadow-[0_16px_40px_rgba(15,23,42,0.05)]',
      className,
    )}
  >
    <div className="flex flex-col items-center justify-center">
      <div
        className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-slate-50 text-slate-400',
          iconWrapClassName,
        )}
      >
        {icon}
      </div>
      <div className="text-lg font-semibold tracking-tight text-slate-950">{title}</div>
      {description ? <div className="mt-3 max-w-md text-sm leading-7 text-slate-500">{description}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
    </div>
  </div>
);

// 统一页面级状态反馈，适用于加载中、加载失败、暂无数据等场景。
export const WorkspaceStatusPage = ({
  icon,
  title,
  description,
  actions,
  className,
  panelClassName,
  iconWrapClassName,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  panelClassName?: string;
  iconWrapClassName?: string;
}) => (
  <div className={cn('relative min-h-full pb-6', className)}>
    <WorkspaceBackdrop />
    <div className="relative z-10 flex min-h-[60vh] items-center justify-center px-4 py-6 md:px-6">
      <WorkspaceStatusPanel
        icon={icon}
        title={title}
        description={description}
        actions={actions}
        className={cn('w-full max-w-2xl', panelClassName)}
        iconWrapClassName={iconWrapClassName}
      />
    </div>
  </div>
);

// 统一区块内的小状态提示，适用于详情区、列表区内的加载中/空数据提示。
export const WorkspaceInlineState = ({
  title,
  description,
  icon,
  type = 'empty',
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  type?: 'loading' | 'empty' | 'info';
  className?: string;
}) => (
  <div
    className={cn(
      'rounded-2xl px-4 py-8 text-center',
      type === 'loading'
        ? 'border border-slate-200 bg-white text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
        : 'border border-dashed border-slate-200 bg-slate-50 text-slate-500',
      className,
    )}
  >
    {type === 'loading' ? (
      <div className="flex items-center justify-center gap-2 text-sm">
        {icon || <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-b-emerald-500" />}
        <span>{title}</span>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center">
        {icon ? (
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
            {icon}
          </div>
        ) : null}
        <div className="text-sm font-medium text-slate-600">{title}</div>
        {description ? <div className="mt-2 max-w-sm text-xs leading-6 text-slate-400">{description}</div> : null}
      </div>
    )}
  </div>
);

export const WorkspaceTableStateRow = ({
  colSpan,
  title,
  description,
  icon,
  type = 'empty',
  variant = 'glass',
  rowClassName,
  cellClassName,
}: {
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  type?: 'loading' | 'empty';
  variant?: 'default' | 'glass';
  rowClassName?: string;
  cellClassName?: string;
}) => (
  <TableRow className={cn('border-slate-200 hover:bg-transparent', rowClassName)}>
    <TableCell colSpan={colSpan} className={cn(type === 'loading' ? 'px-4 py-16' : 'px-4 py-6', cellClassName)}>
      {type === 'loading' ? (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
          {icon || <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-b-emerald-500" />}
          {title}
        </div>
      ) : (
        <WorkspaceEmptyPanel
          variant={variant}
          icon={icon}
          title={title}
          description={description || ''}
        />
      )}
    </TableCell>
  </TableRow>
);
