import React from 'react';
import { cn } from '@/utils/cn';
import { WorkspaceSummaryCard } from './WorkspacePanels';

export interface WorkspaceOverviewMetric {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  panelClassName?: string;
  iconWrapClassName?: string;
  valueClassName?: string;
  hintClassName?: string;
}

interface WorkspaceOverviewMetricsSectionProps {
  badge?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  metrics?: WorkspaceOverviewMetric[];
  className?: string;
  contentClassName?: string;
  metricsGridClassName?: string;
}

export const WorkspaceOverviewMetricsSection: React.FC<WorkspaceOverviewMetricsSectionProps> = ({
  badge,
  title,
  description,
  actions,
  children,
  metrics = [],
  className,
  contentClassName,
  metricsGridClassName,
}) => (
  <WorkspaceSummaryCard
    badge={badge}
    title={title}
    description={description}
    actions={actions}
    className={className}
    contentClassName={contentClassName}
  >
    <>
      {children}
      {metrics.length > 0 ? (
        <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', metricsGridClassName)}>
          {metrics.map((item) => (
            <div
              key={String(item.label)}
              className={cn(
                'stat-card rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950',
                item.panelClassName,
              )}
            >
              {item.icon ? (
                <div className={cn('stat-icon stat-icon-gray shrink-0', item.iconWrapClassName)}>
                  {item.icon}
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="stat-label truncate">{item.label}</div>
                <div className={cn('stat-value mt-1 truncate', item.valueClassName)}>
                  {item.value}
                </div>
                {item.hint ? (
                  <div className={cn('mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400', item.hintClassName)}>
                    {item.hint}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  </WorkspaceSummaryCard>
);
