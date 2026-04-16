import React from 'react';
import { cn } from '@/utils/cn';

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

interface WorkspaceHeroCardProps {
  badge?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  bodyClassName?: string;
  glowClassName?: string;
}

interface WorkspaceSectionCardProps {
  title: string;
  description?: React.ReactNode;
  headerAside?: React.ReactNode;
  children: React.ReactNode;
  eyebrow?: string;
  glowClassName?: string;
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
  glowClassName?: string;
  className?: string;
}

const panelClassName =
  'overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]';

const panelHeaderGlowClassName =
  'bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.08),transparent_58%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.05),transparent_52%)]';

const defaultOverviewToneClassName =
  'border-slate-200 bg-slate-50 text-slate-900';

const defaultMetricToneClassName =
  'border-slate-200 bg-white text-slate-900';

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
  glowClassName = panelHeaderGlowClassName,
  className,
}) => (
  <div className={cn(panelClassName, className)}>
    <div className="relative px-4 py-4 xl:px-5 xl:py-5">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-24', glowClassName)} />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {eyebrow}
            </div>
            <div className="mt-2 text-[1.55rem] font-semibold tracking-tight text-slate-950 xl:text-[1.7rem]">
              {title}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {headerBadges || (
              <>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                  {hasActiveFilters ? '已筛选' : '默认视图'}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
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
              className={cn(
                'rounded-[18px] border px-3.5 py-3 shadow-sm',
                item.toneClassName || defaultOverviewToneClassName,
              )}
            >
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                {item.label}
              </div>
              <div className="mt-1.5 text-sm font-semibold tracking-tight text-slate-900">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {quickFilters?.length || quickFilterAside || filterBar ? (
      <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-4 xl:px-5">
        <div className="flex flex-col gap-3">
          {quickFilters?.length || quickFilterAside ? (
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              {quickFilters?.length ? (
                <div className="inline-flex flex-wrap items-center gap-1 rounded-[16px] border border-slate-200 bg-white p-1">
                  {quickFilters.map((item) => {
                    const active = activeQuickFilter === item.value;

                    return (
                      <button
                        key={item.value || 'ALL'}
                        type="button"
                        onClick={() => onQuickFilterChange?.(item.value)}
                        className={cn(
                          'rounded-[12px] px-3 py-1.5 text-xs font-medium transition',
                          active
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
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
  toneClassName,
  valueClassName,
  className,
}) => (
  <div
    className={cn(
      'rounded-[22px] border px-4 py-4',
      toneClassName || defaultMetricToneClassName,
      'shadow-[0_8px_24px_rgba(15,23,42,0.04)]',
      className,
    )}
  >
    <div className="text-[11px] font-medium text-slate-500">{label}</div>
    <div className="mt-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-[1.9rem] font-semibold tracking-tight text-slate-950 xl:text-[2rem]',
            valueClassName,
          )}
        >
          {value}
        </div>
        {hint ? <div className="mt-1.5 text-xs leading-5 text-slate-400">{hint}</div> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  </div>
);

export const WorkspaceHeroCard: React.FC<WorkspaceHeroCardProps> = ({
  badge,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  bodyClassName,
  glowClassName = panelHeaderGlowClassName,
}) => (
  <div className={cn(panelClassName, className)}>
    <div className={cn('relative px-5 py-5 xl:px-6 xl:py-6', contentClassName)}>
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-28', glowClassName)} />
      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {badge ? <div className="mb-3">{badge}</div> : null}
            <div className="text-[1.85rem] font-semibold tracking-tight text-slate-950 xl:text-[2.15rem]">
              {title}
            </div>
            {description ? (
              <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</div>
            ) : null}
          </div>

          {actions ? <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div> : null}
        </div>

        {children ? <div className={cn('mt-4 xl:mt-5', bodyClassName)}>{children}</div> : null}
      </div>
    </div>
  </div>
);

export const WorkspaceSectionCard: React.FC<WorkspaceSectionCardProps> = ({
  title,
  description,
  headerAside,
  children,
  eyebrow,
  glowClassName = panelHeaderGlowClassName,
  className,
  bodyClassName,
}) => (
  <div className={cn(panelClassName, className)}>
    <div className="relative px-4 py-4 xl:px-5 xl:py-5">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-20', glowClassName)} />
      <div className="relative">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {eyebrow}
              </div>
            ) : null}
            <div
              className={cn(
                eyebrow ? 'mt-2' : '',
                'text-lg font-semibold tracking-tight text-slate-950',
              )}
            >
              {title}
            </div>
            {description ? <div className="mt-1.5 text-sm leading-6 text-slate-500">{description}</div> : null}
          </div>
          {headerAside ? <div className="flex shrink-0 flex-wrap gap-2.5">{headerAside}</div> : null}
        </div>

        <div className={cn('mt-4', bodyClassName)}>{children}</div>
      </div>
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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/24 p-4 backdrop-blur-sm">
    <div
      className={cn(
        'max-h-[90vh] w-full overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]',
        maxWidthClassName,
      )}
    >
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xl font-semibold tracking-tight text-slate-950">{title}</div>
            {description ? <div className="mt-1.5 text-sm leading-6 text-slate-500">{description}</div> : null}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {headerAside}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      <div className={cn('px-6 py-6', bodyClassName)}>{children}</div>
    </div>
  </div>
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3.5">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-xs text-slate-400">{description}</div>
      </div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
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
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3.5">
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
      共 {total} 条
    </span>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={prevDisabled}
        className="h-9 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        上一页
      </button>
      <span className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-600">
        第 {pageNum} / {totalPages} 页
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="h-9 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        下一页
      </button>
    </div>
  </div>
);
