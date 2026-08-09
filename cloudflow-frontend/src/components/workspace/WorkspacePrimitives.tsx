import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { TableCell, TableRow } from '@/components/common/table';
import { EmptyState, LoadingSpinner } from '@/components/common';

export const WorkspaceBackdrop: React.FC = () => (
  <div className="pointer-events-none fixed inset-0 z-[-1] bg-[var(--cf-bg)] dark:bg-slate-950" />
);

export const WorkspacePageContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={cn('admin-source-content-grid relative z-10 px-4 py-4 md:px-6', className)}>{children}</div>
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
      <div className="text-[11px] font-semibold text-cf-faint">
        {eyebrow}
      </div>
      <div className="mt-2 text-lg font-semibold text-cf-title">{title}</div>
    </div>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1 text-xs font-semibold text-cf-faint transition hover:text-cyan-700 dark:hover:text-cyan-300"
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
  variant?: 'default' | 'panel';
}) => (
  <div
    className={cn(
      'rounded-md',
      variant === 'panel'
        ? 'border border-slate-200 bg-[var(--cf-surface-strong)] shadow-none dark:border-slate-800 dark:bg-slate-950/88'
        : 'border border-dashed border-slate-200 bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-900/60',
    )}
  >
    <EmptyState icon={icon} title={title} description={description} className="px-6 py-6" />
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
  <div className={cn('card px-6 py-6 text-center', className)}>
    <div className="flex flex-col items-center justify-center">
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-[var(--cf-surface-muted)] text-cf-faint dark:bg-slate-900',
          iconWrapClassName,
        )}
      >
        {icon}
      </div>
      <div className="text-lg font-semibold text-cf-title">{title}</div>
      {description ? (
        <div className="mt-3 max-w-md text-sm leading-6 text-cf-subtle">{description}</div>
      ) : null}
      {actions ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  </div>
);

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
}) => {
  if (type === 'loading') {
    return (
      <div
        className={cn(
          'rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-6 text-center text-cf-subtle shadow-none dark:border-slate-800 dark:bg-slate-950/88',
          className,
        )}
      >
        <div className="flex items-center justify-center gap-2 text-sm">
          {icon || <LoadingSpinner size="sm" />}
          <span>{title}</span>
        </div>
        {description ? <div className="mt-2 text-xs leading-6 text-cf-faint">{description}</div> : null}
      </div>
    );
  }

  return (
    <WorkspaceEmptyPanel
      variant={type === 'info' ? 'panel' : 'default'}
      icon={
        icon || <div className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-200" />
      }
      title={String(title)}
      description={description ? String(description) : ''}
    />
  );
};

export const WorkspaceTableStateRow = ({
  colSpan,
  title,
  description,
  icon,
  type = 'empty',
  variant = 'panel',
  rowClassName,
  cellClassName,
}: {
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  type?: 'loading' | 'empty';
  variant?: 'default' | 'panel';
  rowClassName?: string;
  cellClassName?: string;
}) => (
  <TableRow className={cn('border-slate-200 hover:bg-transparent dark:border-slate-800', rowClassName)}>
    <TableCell
      colSpan={colSpan}
      className={cn(type === 'loading' ? 'px-4 py-10' : 'px-4 py-6', cellClassName)}
    >
      {type === 'loading' ? (
        <div className="flex items-center justify-center gap-2 text-sm text-cf-subtle">
          {icon || <LoadingSpinner size="sm" />}
          {title}
        </div>
      ) : (
        <WorkspaceEmptyPanel
          variant={variant}
          icon={icon || undefined}
          title={title}
          description={description || ''}
        />
      )}
    </TableCell>
  </TableRow>
);
