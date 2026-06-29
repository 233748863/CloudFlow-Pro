import React from 'react';
import { cn } from '@/utils/cn';
import { BaseDialog } from '@/components/common';
import { SegmentedControl, SegmentedControlItem } from '@/components/common';

export interface WorkspaceOverviewItem {
  label: string;
  value: React.ReactNode;
  toneClassName?: string;
}

export interface WorkspaceQuickFilterItem {
  label: string;
  value: string;
}

interface WorkspaceMetricCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  aside?: React.ReactNode;
  toneClassName?: string;
  valueClassName?: string;
  className?: string;
}

interface WorkspaceSummaryCardProps {
  badge?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  bodyClassName?: string;
}

interface WorkspaceSectionCardProps {
  title: string;
  description?: React.ReactNode;
  headerAside?: React.ReactNode;
  children: React.ReactNode;
  eyebrow?: string;
  className?: string;
  bodyClassName?: string;
}

interface WorkspaceDialogShellProps {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
  headerAside?: React.ReactNode;
  bodyClassName?: string;
}

interface WorkspaceWorkbenchCardProps {
  eyebrow?: string;
  title: string;
  total: number;
  hasActiveFilters: boolean;
  overviewItems: WorkspaceOverviewItem[];
  headerBadges?: React.ReactNode;
  quickFilters?: WorkspaceQuickFilterItem[];
  activeQuickFilter?: string;
  onQuickFilterChange?: (value: string) => void;
  quickFilterAside?: React.ReactNode;
  filterBar?: React.ReactNode;
  className?: string;
}

const panelClassName = 'card overflow-hidden';

const defaultOverviewToneClassName =
  'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-900 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100';

const defaultMetricToneClassName =
  'border border-slate-200 bg-[var(--cf-surface-strong)] text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';

export const WorkspaceWorkbenchCard: React.FC<WorkspaceWorkbenchCardProps> = ({
  eyebrow = '记录',
  title,
  total,
  hasActiveFilters,
  overviewItems,
  headerBadges,
  quickFilters,
  activeQuickFilter,
  onQuickFilterChange,
  quickFilterAside,
  filterBar,
  className,
}) => (
  <div className={cn(panelClassName, className)}>
    <div className="px-4 py-4 xl:px-5 xl:py-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              {eyebrow}
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-100">
              {title}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {headerBadges || (
              <>
                <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {hasActiveFilters ? '筛选结果' : '默认视图'}
                </span>
                <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  共 {total} 条
                </span>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-2.5 pt-1 sm:grid-cols-2 xl:grid-cols-4">
          {overviewItems.map((item) => (
            <div
              key={String(item.label)}
              className={cn('rounded-md px-3.5 py-3 shadow-none', defaultOverviewToneClassName)}
            >
              <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                {item.label}
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {quickFilters?.length || quickFilterAside || filterBar ? (
      <div className="border-t border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-4 xl:px-5 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex flex-col gap-3">
          {quickFilters?.length || quickFilterAside ? (
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              {quickFilters?.length ? (
                <SegmentedControl className="flex-wrap">
                  {quickFilters.map((item) => {
                    return (
                      <SegmentedControlItem
                        key={item.value || 'ALL'}
                        size="sm"
                        active={activeQuickFilter === item.value}
                        onClick={() => onQuickFilterChange?.(item.value)}
                      >
                        {item.label}
                      </SegmentedControlItem>
                    );
                  })}
                </SegmentedControl>
              ) : (
                <div />
              )}

              {quickFilterAside}
            </div>
          ) : null}

          {filterBar}
        </div>
      </div>
    ) : null}
  </div>
);

export const WorkspaceMetricCard: React.FC<WorkspaceMetricCardProps> = ({
  label,
  value,
  hint,
  aside,
  valueClassName,
  className,
}) => (
    <div className={cn('stat-card items-start rounded-md', defaultMetricToneClassName, className)}>
    {aside ? <div className="shrink-0">{aside}</div> : null}
    <div className="min-w-0 flex-1">
      <div className="stat-label">{label}</div>
      <div className={cn('stat-value mt-1 truncate', valueClassName)}>{value}</div>
      {hint ? <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  </div>
);

export const WorkspaceSummaryCard: React.FC<WorkspaceSummaryCardProps> = ({
  badge,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  bodyClassName,
}) => (
  <div className={cn(panelClassName, className)}>
    <div className={cn('px-4 py-4 xl:px-5 xl:py-5', contentClassName)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {badge ? <div className="mb-3">{badge}</div> : null}
          <div className="text-xl font-semibold text-slate-950 dark:text-slate-100">
            {title}
          </div>
          {description ? (
            <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {description}
            </div>
          ) : null}
        </div>

        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>

      {children ? <div className={cn('mt-4', bodyClassName)}>{children}</div> : null}
    </div>
  </div>
);

export const WorkspaceSectionCard: React.FC<WorkspaceSectionCardProps> = ({
  title,
  description,
  headerAside,
  children,
  eyebrow,
  className,
  bodyClassName,
}) => (
  <div className={cn(panelClassName, className)}>
    <div className="px-4 py-4 xl:px-5 xl:py-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              {eyebrow}
            </div>
          ) : null}
          <div
            className={cn(
              eyebrow ? 'mt-2' : '',
              'text-lg font-semibold text-slate-950 dark:text-slate-100',
            )}
          >
            {title}
          </div>
          {description ? (
            <div className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {description}
            </div>
          ) : null}
        </div>
        {headerAside ? <div className="flex shrink-0 flex-wrap gap-2">{headerAside}</div> : null}
      </div>

          <div className={cn('mt-4', bodyClassName)}>{children}</div>
    </div>
  </div>
);

export const WorkspaceDialogShell: React.FC<WorkspaceDialogShellProps> = ({
  title,
  description,
  onClose,
  children,
  maxWidthClassName = 'max-w-4xl',
  headerAside,
  bodyClassName,
}) => (
  <BaseDialog
    open
    title={title}
    description={description}
    onClose={onClose}
    maxWidthClassName={maxWidthClassName}
    headerAside={headerAside}
    bodyClassName={bodyClassName}
  >
    {children}
  </BaseDialog>
);

interface WorkspaceResultCardProps {
  total: number;
  description: string;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const WorkspaceResultCard: React.FC<WorkspaceResultCardProps> = ({
  total,
  description,
  title = '当前结果',
  children,
  footer,
  className,
}) => (
  <div className={cn(panelClassName, className)}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900/60">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</div>
      </div>
      <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        共 {total} 条
      </span>
    </div>
    {children}
    {footer}
  </div>
);

interface WorkspacePaginationBarProps {
  total: number;
  pageNum: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}

export const WorkspacePaginationBar: React.FC<WorkspacePaginationBarProps> = ({
  total,
  pageNum,
  totalPages,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950">
    <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      共 {total} 条
    </span>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={prevDisabled}
        className="h-9 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white"
      >
        上一页
      </button>
      <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3.5 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        第 {pageNum} / {totalPages} 页
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="h-9 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white"
      >
        下一页
      </button>
    </div>
  </div>
);
