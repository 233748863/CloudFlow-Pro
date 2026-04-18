import React from 'react';
import { cn } from '@/utils/cn';
import { WorkspaceHeroCard } from './WorkspacePanels';

export interface WorkspaceHeroMetric {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  panelClassName?: string;
  iconWrapClassName?: string;
  valueClassName?: string;
  hintClassName?: string;
  glowClassName?: string;
}

interface WorkspaceHeroMetricsSectionProps {
  badge?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  metrics?: WorkspaceHeroMetric[];
  className?: string;
  contentClassName?: string;
  glowClassName?: string;
  metricsGridClassName?: string;
}

export const WorkspaceHeroMetricsSection: React.FC<WorkspaceHeroMetricsSectionProps> = ({
  badge,
  title,
  description,
  actions,
  children,
  metrics = [],
  className,
  contentClassName,
  glowClassName,
  metricsGridClassName,
}) => (
  <WorkspaceHeroCard
    badge={badge}
    title={title}
    description={description}
    actions={actions}
    className={className}
    contentClassName={contentClassName}
    glowClassName={glowClassName}
  >
    <>
      {children}
      {metrics.length > 0 ? (
        <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', metricsGridClassName)}>
          {metrics.map((item) => (
            <div
              key={String(item.label)}
              className={cn(
                'stat-card rounded-2xl border border-slate-200 bg-white',
              )}
            >
              {item.icon ? (
                <div
                  className={cn(
                    'stat-icon stat-icon-gray shrink-0',
                    item.iconWrapClassName,
                  )}
                >
                  {item.icon}
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="stat-label truncate">{item.label}</div>
                <div className={cn('stat-value mt-1 truncate', item.valueClassName)}>{item.value}</div>
                {item.hint ? (
                  <div className={cn('mt-1 text-xs leading-5 text-slate-500', item.hintClassName)}>
                    {item.hint}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  </WorkspaceHeroCard>
);
