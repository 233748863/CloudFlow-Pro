import React from 'react';
import { ArrowRight } from 'lucide-react';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import { DASHBOARD_TONE_STYLES, type DashboardTone } from './types';
import { formatDashboardCurrency } from './helpers';

export const DashboardMetricTile = ({
  label,
  value,
  hint,
  valueClassName = 'text-cf-title',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  valueClassName?: string;
}) => (
  <div className="p-4">
    <div className="text-xs font-medium text-cf-subtle">{label}</div>
    <div className={`mt-2 text-xl font-semibold tabular-nums ${valueClassName}`}>{value}</div>
    {hint ? <div className="mt-1 text-xs text-cf-subtle">{hint}</div> : null}
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
  <div className="p-4">
    <div className="text-xs font-medium text-cf-subtle">{label}</div>
    <div className="mt-2 text-sm font-medium text-cf-title">{title}</div>
    {meta ? <div className="mt-1 text-xs text-cf-subtle">{meta}</div> : null}
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
  <InnerTableSurface className="admin-crm-dashboard-section" wrapperClassName="p-0">
    <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {aside ? <div>{aside}</div> : null}
    </div>
    <div className="admin-crm-section-body">{children}</div>
  </InnerTableSurface>
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
      className="admin-crm-action-row group w-full text-left"
    >
      <div className="flex items-start gap-3">
        <div className={`admin-source-stat-icon h-9 w-9 flex-none ${toneStyle.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="admin-crm-row-label">{label}</div>
          <div className="admin-crm-row-title">{title}</div>
          <div className="admin-crm-row-detail">{detail}</div>
          <div className="admin-crm-row-meta">{meta}</div>
        </div>
        <div className={`admin-crm-row-action ${toneStyle.hover}`}>
          <span className={toneStyle.accent}>{actionLabel}</span>
          <ArrowRight size={16} />
        </div>
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
      className="admin-crm-feed-row group w-full text-left"
    >
      <div className="flex items-start gap-3">
        <div className={`admin-source-stat-icon mt-0.5 h-9 w-9 flex-none ${toneStyle.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="admin-crm-row-label">{label}</div>
          <div className="admin-crm-row-title">{title}</div>
          <div className="admin-crm-row-detail">{detail}</div>
        </div>
        <div className={`admin-crm-row-action ${toneStyle.hover}`}>
          <span className={toneStyle.accent}>{actionLabel}</span>
          <ArrowRight size={15} />
        </div>
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
  <div className={`admin-crm-stage-cell${emphasis ? ' is-emphasis' : ''}`}>
    <div className="admin-crm-row-label">{label}</div>
    <div className="mt-2 flex items-end justify-between gap-3">
      <div className={`text-xl font-semibold tabular-nums ${emphasis ? 'text-cyan-700 dark:text-cyan-200' : 'text-cf-title '}`}>
        {count}
      </div>
      <div className="text-xs text-cf-subtle">{formatDashboardCurrency(amount)}</div>
    </div>
  </div>
);
