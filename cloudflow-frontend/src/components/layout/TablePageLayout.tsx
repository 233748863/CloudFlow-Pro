import React, { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';

interface TablePageLayoutProps {
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  table: React.ReactNode;
  pagination?: React.ReactNode;
  className?: string;
  tableSurfaceClassName?: string;
}

interface InnerTableSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  wrapperClassName?: string;
  /** 子节点自带 TableScrollArea 时关闭默认滚动层，避免 sticky 绑定到外层坐标系。 */
  disableScrollWrapper?: boolean;
}

export const InnerTableSurface = React.forwardRef<
  HTMLDivElement,
  InnerTableSurfaceProps
>(({ className = '', wrapperClassName = '', disableScrollWrapper = false, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'table-scroll-container admin-inner-table-surface',
      className,
      'h-auto flex-none overflow-visible',
    )}
    {...props}
  >
    {disableScrollWrapper ? children : (
      <div className={cn('table-wrapper', wrapperClassName, 'flex-none overflow-x-auto overflow-y-visible')}>
        {children}
      </div>
    )}
  </div>
));

InnerTableSurface.displayName = 'InnerTableSurface';

export const TablePageLayout: React.FC<TablePageLayoutProps> = ({
  actions,
  filters,
  table,
  pagination,
  className,
  tableSurfaceClassName,
}) => {
  const [mobileMode, setMobileMode] = useState(false);

  useEffect(() => {
    const syncMobileMode = () => {
      setMobileMode(window.innerWidth < 1024);
    };

    syncMobileMode();
    window.addEventListener('resize', syncMobileMode);

    return () => window.removeEventListener('resize', syncMobileMode);
  }, []);

  return (
    <div
      className={cn(
        'table-page-layout flex flex-col gap-5',
        mobileMode && 'mobile-mode',
        className,
      )}
    >
      {actions ? <div className="layout-section-fixed flex-shrink-0">{actions}</div> : null}
      {filters ? <div className="layout-section-fixed flex-shrink-0">{filters}</div> : null}

      <div className="layout-section-scrollable flex min-w-0 flex-none flex-col">
        <div
          className={cn(
            'table-page-layout-surface',
            pagination && 'has-pagination',
            tableSurfaceClassName,
          )}
        >
          {table}
        </div>
      </div>
      {pagination ? (
        <div className="layout-section-fixed table-page-layout-pagination flex-shrink-0">
          {pagination}
        </div>
      ) : null}
    </div>
  );
};
