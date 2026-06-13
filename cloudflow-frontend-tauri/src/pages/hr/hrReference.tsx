import React from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

interface HrInlineStateProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

interface HrTableStateRowProps extends HrInlineStateProps {
  colSpan: number;
}

interface HrDialogSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  titleAction?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

interface HrDetailFieldProps {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}

interface HrStatusPillProps {
  label: React.ReactNode;
  className: string;
}

export const HrInlineState: React.FC<HrInlineStateProps> = ({
  title,
  description,
  icon,
  loading = false,
  actions,
  className,
}) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon || <Inbox className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
    {actions ? <div className="mt-4">{actions}</div> : null}
  </div>
);

export const HrTableStateRow: React.FC<HrTableStateRowProps> = ({
  colSpan,
  title,
  description,
  icon,
  loading = false,
}) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-14">
      <HrInlineState
        title={title}
        description={description}
        icon={icon}
        loading={loading}
        className={loading ? 'py-6' : 'py-4'}
      />
    </td>
  </tr>
);

export const HrDialogSection: React.FC<HrDialogSectionProps> = ({
  title,
  description,
  titleAction,
  className,
  contentClassName,
  children,
}) => (
  <section
    className={cn(
      'overflow-visible rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88',
      className,
    )}
  >
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
      {titleAction ? <div className="flex flex-wrap items-center gap-2">{titleAction}</div> : null}
    </div>
    <div className={cn('overflow-visible p-4', contentClassName)}>{children}</div>
  </section>
);

export const HrDetailField: React.FC<HrDetailFieldProps> = ({ label, value, className }) => (
  <div className={cn('min-w-0', className)}>
    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
      {label}
    </div>
    <div className="mt-1.5 break-words text-sm text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

export const HrStatusPill: React.FC<HrStatusPillProps> = ({ label, className }) => (
  <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', className)}>
    {label}
  </span>
);
