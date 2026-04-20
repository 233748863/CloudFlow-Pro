import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title = '暂无数据',
  description = '',
  actionText,
  onAction,
  className,
}) => (
  <div className={cn('empty-state', className)}>
    <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-900">
      {icon || <Inbox className="empty-state-icon h-10 w-10" />}
    </div>
    <h3 className="empty-state-title">{title}</h3>
    {description ? <p className="empty-state-description">{description}</p> : null}
    {actionText && onAction ? (
      <div className="mt-6">
        <Button onClick={onAction}>{actionText}</Button>
      </div>
    ) : null}
  </div>
);
