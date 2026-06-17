import React from 'react';
import { ArrowRight } from 'lucide-react';
import { DASHBOARD_TONE_STYLES, type DashboardTone } from './types';
import { formatDashboardCurrency } from './helpers';

export const DashboardMetricTile = ({
  label,
  value,
  hint,
  valueClassName = 'text-slate-900 dark:text-white',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  valueClassName?: string;
}) => (
  <div className="cf-section-card px-4 py-4">
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${valueClassName}`}>{value}</div>
    {hint ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
  </div>
);

export const DashboardFocusItem = ({
  label,
  title,
  meta,
}: {
  label: string;
  title: string;
  meta?: string;
}) => (
  <div className="cf-section-card px-4 py-4">
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 text-sm font-medium text-slate-900 dark:text-white">{title}</div>
    {meta ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta}</div> : null}
  </div>
);

export const DashboardSection = ({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="cf-section-card p-0">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="px-5 pt-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
      {aside ? <div className="px-5 pt-5">{aside}</div> : null}
    </div>
    <div className="border-t border-slate-100 p-5 dark:border-slate-800">{children}</div>
  </section>
);

export const DashboardActionCard = ({
  tone = 'cyan',
  label,
  title,
  detail,
  meta,
  icon,
  actionLabel,
  onAction,
}: {
  tone?: DashboardTone;
  label: string;
  title: string;
  detail: string;
  meta: string;
  icon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) => {
  const toneStyle = DASHBOARD_TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onAction}
      className="cf-interactive-card group w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left dark:border-slate-800 dark:bg-slate-900/60"
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneStyle.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detail}</div>
          <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{meta}</div>
        </div>
        <div className={`mt-1 text-slate-400 transition-colors ${toneStyle.hover}`}>
          <ArrowRight size={16} />
        </div>
      </div>
      <div className={`mt-3 text-xs font-medium ${toneStyle.accent}`}>
        {actionLabel}
      </div>
    </button>
  );
};

export const DashboardFeedItem = ({
  tone = 'cyan',
  label,
  title,
  detail,
  icon,
  actionLabel,
  onAction,
}: {
  tone?: DashboardTone;
  label: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) => {
  const toneStyle = DASHBOARD_TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onAction}
      className="cf-interactive-card group w-full rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-left dark:border-slate-800 dark:bg-slate-900/60"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneStyle.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</div>
        </div>
        <div className={`mt-1 text-slate-400 transition-colors ${toneStyle.hover}`}>
          <ArrowRight size={15} />
        </div>
      </div>
      <div className={`mt-3 text-xs font-medium ${toneStyle.accent}`}>
        {actionLabel}
      </div>
    </button>
  );
};

export const DashboardStageCard = ({
  label,
  count,
  amount,
  emphasis = false,
}: {
  label: string;
  count: number;
  amount: number;
  emphasis?: boolean;
}) => (
  <div className={`rounded-2xl border px-4 py-4 ${emphasis ? 'border-cyan-200 bg-cyan-50/60 dark:border-cyan-900/40 dark:bg-cyan-950/18' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60'}`}>
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 flex items-end justify-between gap-3">
      <div className={`text-2xl font-semibold tabular-nums ${emphasis ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-900 dark:text-white'}`}>
        {count}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{formatDashboardCurrency(amount)}</div>
    </div>
  </div>
);
