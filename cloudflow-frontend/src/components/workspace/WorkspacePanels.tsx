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

const defaultOverviewToneClassName =
  'border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]';

const defaultMetricToneClassName =
  'border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(248,250,252,0.76))] text-slate-900 shadow-[0_14px_30px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)]';

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
  glowClassName = 'bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.09),transparent_60%)]',
  className,
}) => (
  <div
    className={cn(
      'overflow-hidden rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] shadow-[0_16px_34px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl',
      className,
    )}
  >
    <div className="relative px-4 py-4">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-24', glowClassName)} />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
            <div className="mt-2 text-[1.65rem] font-bold tracking-tight text-slate-950">{title}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {headerBadges || (
              <>
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  {hasActiveFilters ? '已应用筛选' : '默认视图'}
                </span>
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  共 {total} 条
                </span>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
          {overviewItems.map((item) => (
            <div
              key={String(item.label)}
              className={cn(
                'rounded-[18px] border px-3.5 py-2.5 shadow-sm',
                item.toneClassName || defaultOverviewToneClassName,
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
              <div className="mt-1.5 text-sm font-semibold tracking-tight">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {(quickFilters?.length || quickFilterAside || filterBar) ? (
      <div className="border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.76),rgba(255,255,255,0.72))] px-4 py-4 backdrop-blur-xl">
        <div className="flex flex-col gap-3">
          {(quickFilters?.length || quickFilterAside) ? (
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              {quickFilters?.length ? (
                <div className="inline-flex flex-wrap items-center gap-1 rounded-[20px] bg-white/78 p-1 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-md">
                  {quickFilters.map((item) => {
                    const active = activeQuickFilter === item.value;
                    return (
                      <button
                        key={item.value || 'ALL'}
                        type="button"
                        onClick={() => onQuickFilterChange?.(item.value)}
                        className={cn(
                          'rounded-[16px] px-3 py-1.5 text-[11px] font-medium transition',
                          active
                            ? 'bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_10px_20px_rgba(236,72,153,0.24)]'
                            : 'text-slate-600 hover:bg-white/88 hover:text-pink-600',
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
      'rounded-[24px] border px-5 py-4 backdrop-blur-xl',
      toneClassName || defaultMetricToneClassName,
      className,
    )}
  >
    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className="mt-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className={cn('text-[1.9rem] font-bold tracking-tight text-slate-950', valueClassName)}>{value}</div>
        {hint ? <div className="mt-2 text-xs text-slate-400">{hint}</div> : null}
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
  glowClassName = 'bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.12),transparent_58%),radial-gradient(circle_at_top_right,rgba(125,211,252,0.1),transparent_52%)]',
}) => (
  <div
    className={cn(
      'overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,250,252,0.84))] shadow-[0_20px_54px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.76)] backdrop-blur-xl',
      className,
    )}
  >
    <div className={cn('relative px-8 py-8', contentClassName)}>
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-32', glowClassName)} />
      <div className="relative">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {badge ? <div className="mb-2">{badge}</div> : null}
            <div className="text-3xl font-bold tracking-tight text-slate-900">{title}</div>
            {description ? <div className="mt-2 text-sm text-slate-500">{description}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
        </div>
        {children ? <div className={cn('mt-3', bodyClassName)}>{children}</div> : null}
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
  glowClassName = 'bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.08),transparent_62%)]',
  className,
  bodyClassName,
}) => (
  <div
    className={cn(
      'overflow-hidden rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] shadow-[0_16px_34px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl',
      className,
    )}
  >
    <div className="relative px-5 py-5">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-24', glowClassName)} />
      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
            ) : null}
            <div className={cn(eyebrow ? 'mt-2' : '', 'text-lg font-semibold text-slate-900')}>{title}</div>
            {description ? <div className="mt-1 text-sm text-slate-500">{description}</div> : null}
          </div>
          {headerAside ? <div className="flex shrink-0 flex-wrap gap-3">{headerAside}</div> : null}
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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.34)] p-4 backdrop-blur-md">
    <div
      className={cn(
        'max-h-[90vh] w-full overflow-y-auto rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] shadow-[0_28px_80px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-xl',
        maxWidthClassName,
      )}
    >
      <div className="relative overflow-hidden border-b border-white/70 px-6 py-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.12),transparent_58%),radial-gradient(circle_at_top_right,rgba(125,211,252,0.12),transparent_52%)]" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xl font-semibold text-slate-900">{title}</div>
            {description ? <div className="mt-1 text-sm text-slate-500">{description}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {headerAside}
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:bg-white hover:text-slate-700"
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
  <div
    className={cn(
      'overflow-hidden rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] shadow-[0_16px_34px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl',
      className,
    )}
  >
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.68))] px-4 py-3 backdrop-blur-xl">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-[11px] text-slate-400">{description}</div>
      </div>
      <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
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
  <div className="flex items-center justify-between border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.6))] px-4 py-3">
    <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      共 {total} 条
    </span>
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={prevDisabled}
        className="h-9 rounded-2xl border border-white/80 bg-white/76 px-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        上一页
      </button>
      <span className="rounded-full bg-white/76 px-3 py-2 text-sm text-slate-600 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
        第 {pageNum} / {totalPages} 页
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="h-9 rounded-2xl border border-white/80 bg-white/76 px-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        下一页
      </button>
    </div>
  </div>
);
