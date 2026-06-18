import React from 'react';
import { cn } from '@/utils/cn';

interface TablePageLayoutProps {
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  table: React.ReactNode;
  pagination?: React.ReactNode;
  className?: string;
}

interface TableSurfaceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  fill?: boolean;
}

export const TableSurfaceCard = React.forwardRef<
  HTMLDivElement,
  TableSurfaceCardProps
>(({ className = '', fill = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88',
      fill && 'flex min-h-[40rem] flex-col',
      className,
    )}
    {...props}
  />
));

TableSurfaceCard.displayName = 'TableSurfaceCard';

export const TablePageLayout: React.FC<TablePageLayoutProps> = ({
  actions,
  filters,
  table,
  pagination,
  className,
}) => (
  <div className={cn('flex flex-col gap-6', className)}>
      {actions ? <div className="flex-shrink-0">{actions}</div> : null}
      {filters ? <div className="flex-shrink-0">{filters}</div> : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {table}
      </div>

      {pagination ? <div className="flex-shrink-0">{pagination}</div> : null}
    </div>
);
