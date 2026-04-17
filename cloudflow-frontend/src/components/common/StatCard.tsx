import React from 'react';
import { cn } from '@/utils/cn';

type IconVariant = 'primary' | 'success' | 'warning' | 'danger' | 'gray';

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  iconVariant?: IconVariant;
  meta?: React.ReactNode;
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
  className,
}) => (
  <div className={cn('stat-card', className)}>
    {icon ? (
      <div className={cn('stat-icon', iconVariantClassMap[iconVariant])}>{icon}</div>
    ) : null}
    <div className="min-w-0 flex-1">
      <p className="stat-label truncate">{title}</p>
      <div className="mt-1">
        <p className="stat-value truncate">{value}</p>
      </div>
      {meta ? <div className="mt-1 text-xs text-slate-500">{meta}</div> : null}
    </div>
  </div>
);
