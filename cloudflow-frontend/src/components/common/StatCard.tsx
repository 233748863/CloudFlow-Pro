import React from 'react';
import { cn } from '@/utils/cn';

type IconVariant = 'primary' | 'success' | 'warning' | 'danger' | 'gray';

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  iconVariant?: IconVariant;
  meta?: React.ReactNode;
  interactive?: boolean;
  iconClassName?: string;
  valueClassName?: string;
  metaClassName?: string;
  className?: string;
}

const iconVariantClassMap: Record<IconVariant, string> = {
  primary: 'stat-icon-primary',
  success: 'stat-icon-success',
  warning: 'stat-icon-warning',
  danger: 'stat-icon-danger',
  gray: 'stat-icon-gray',
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  iconVariant = 'primary',
  meta,
  interactive = false,
  iconClassName,
  valueClassName,
  metaClassName,
  className,
}) => (
  <div className={cn('stat-card', interactive && 'cf-interactive-card', className)}>
    {icon ? (
      <div className={cn('stat-icon', iconVariantClassMap[iconVariant], iconClassName)}>{icon}</div>
    ) : null}
    <div className="min-w-0 flex-1">
      <p className="stat-label truncate">{title}</p>
      <div className="mt-1">
        <p className={cn('stat-value truncate', valueClassName)}>{value}</p>
      </div>
      {meta ? (
        <div className={cn('mt-1 text-xs text-slate-500 dark:text-slate-400', metaClassName)}>
          {meta}
        </div>
      ) : null}
    </div>
  </div>
);
