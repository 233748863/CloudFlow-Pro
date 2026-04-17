import React, { useEffect, useState } from 'react';
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
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  return (
    <div className={cn('flex flex-col gap-6', isMobile ? 'table-page-mobile' : '', className)}>
      {actions ? <div className="flex-shrink-0">{actions}</div> : null}
      {filters ? <div className="flex-shrink-0">{filters}</div> : null}

      <div className={cn('flex min-h-0 flex-1 flex-col', isMobile ? 'min-h-fit flex-none' : '')}>
        <div
          className={cn(
            'flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
            isMobile ? 'h-auto overflow-visible border-none bg-transparent shadow-none' : '',
          )}
        >
          {table}
        </div>
      </div>

      {pagination ? <div className="flex-shrink-0">{pagination}</div> : null}
    </div>
  );
};
