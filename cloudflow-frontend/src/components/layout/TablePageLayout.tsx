import React from 'react';
import { cn } from '@/utils/cn';

interface TablePageLayoutProps {
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  table: React.ReactNode;
  pagination?: React.ReactNode;
  className?: string;
}

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
        <div
          className={cn(
            'flex flex-col overflow-visible rounded-none border-none bg-transparent shadow-none',
            'lg:h-full lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm dark:lg:border-slate-800 dark:lg:bg-slate-950/88',
          )}
        >
          {table}
        </div>
      </div>

      {pagination ? <div className="flex-shrink-0">{pagination}</div> : null}
    </div>
);
