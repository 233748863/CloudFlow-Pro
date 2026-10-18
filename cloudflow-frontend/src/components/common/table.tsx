import React from 'react';
import { cn } from '@/utils/cn';
import { useFrozenColumns } from '@/hooks/useFrozenColumns';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { MobileListCard } from '@/components/mobile/MobileListCard';

const MobileTableContext = React.createContext(false);
const TableBodyContext = React.createContext(false);

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string;
  disableScrollWrapper?: boolean;
  /** 表头吸顶。需要滚动容器有高度约束才有意义 */
  stickyHeader?: boolean;
  /**
   * 冻结列数量。左侧从第 1 列起、右侧从最后 1 列起，
   * 偏移量按实际列宽自动累加。含 colspan 的表格不要开。
   */
  pinnedColumns?: { left?: number; right?: number };
  mobileLayout?: 'cards' | 'scroll';
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  (
    {
      className = '',
      wrapperClassName = '',
      disableScrollWrapper = false,
      stickyHeader = false,
      pinnedColumns,
      mobileLayout = 'cards',
      children,
      ...props
    },
    ref,
  ) => {
    const isMobile = useBreakpoint() === 'mobile' && mobileLayout === 'cards';
    const leftCount = isMobile ? 0 : pinnedColumns?.left ?? 0;
    const rightCount = isMobile ? 0 : pinnedColumns?.right ?? 0;
    const frozenRef = useFrozenColumns<HTMLTableElement>({
      left: leftCount,
      right: rightCount,
    });

    const setRefs = React.useCallback(
      (node: HTMLTableElement | null) => {
        frozenRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTableElement | null>).current = node;
      },
      [ref, frozenRef],
    );

    React.useEffect(() => {
      const table = frozenRef.current;
      if (!table || !isMobile) return;
      const syncLabels = () => {
        const headingRow = Array.from(table.tHead?.rows || []).at(-1);
        const labels = Array.from(headingRow?.cells || []).map((cell) => cell.textContent?.trim() || cell.getAttribute('aria-label') || '');
        Array.from(table.tBodies).forEach((body) => Array.from(body.rows).forEach((row) => {
          let columnIndex = 0;
          Array.from(row.cells).forEach((cell) => {
            cell.dataset.cfMobileLabel = cell.colSpan > 1 ? '' : labels[columnIndex] || '';
            columnIndex += cell.colSpan;
          });
        }));
      };
      syncLabels();
      const observer = new MutationObserver(syncLabels);
      observer.observe(table, { childList: true, characterData: true, subtree: true });
      return () => observer.disconnect();
    }, [isMobile, frozenRef]);

    const tableElement = (
      <MobileTableContext.Provider value={isMobile}>
      <table
        ref={setRefs}
        className={cn(
          'unity-data-table w-full caption-bottom text-sm',
          stickyHeader && 'cf-table-sticky cf-table-sticky-header',
          isMobile && 'cf-mobile-table',
          className,
        )}
        {...props}
      >
        {children}
      </table>
      </MobileTableContext.Provider>
    );

    if (disableScrollWrapper) {
      return tableElement;
    }

    return (
      <div className={cn('relative w-full overflow-auto', isMobile && 'cf-mobile-table-wrapper', wrapperClassName)}>{tableElement}</div>
    );
  },
);

Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = '', ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'border-b border-slate-200 bg-[var(--cf-surface-muted)] [&_tr]:border-b [&_tr]:border-slate-200',
      'dark:border-slate-800 dark:bg-slate-900/60 dark:[&_tr]:border-slate-800',
      className,
    )}
    {...props}
  />
));

TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = '', ...props }, ref) => (
  <TableBodyContext.Provider value>
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
  </TableBodyContext.Provider>
));

TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = '', ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-slate-200 bg-[var(--cf-surface-muted)] font-medium [&>tr]:last:border-b-0',
      'dark:border-slate-800 dark:bg-slate-900/60',
      className,
    )}
    {...props}
  />
));

TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className = '', ...props }, ref) => {
  const isMobile = React.useContext(MobileTableContext);
  const isBody = React.useContext(TableBodyContext);
  if (isMobile && isBody) {
    return <MobileListCard as="tr" ref={ref as React.Ref<HTMLElement>} className={className} {...props} />;
  }
  return <tr
    ref={ref}
    className={cn(
      'border-b border-slate-200 transition-colors hover:bg-[var(--cf-surface-muted)] data-[state=selected]:bg-cyan-50/40 dark:border-slate-800 dark:hover:bg-slate-900/70 dark:data-[state=selected]:bg-cyan-950/30',
      className,
    )}
    {...props}
  />;
});

TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className = '', ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'px-4 py-3 text-left align-middle text-xs font-medium whitespace-nowrap text-cf-subtle [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...props}
  />
));

TableHead.displayName = 'TableHead';

const TableActionHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className = '', ...props }, ref) => {
  const hasAlignment = className.includes('text-left') || className.includes('text-center') || className.includes('text-right');
  return (
    <TableHead
      ref={ref}
      className={cn('w-[12rem] whitespace-nowrap', !hasAlignment && 'text-right pr-6', className)}
      {...props}
    />
  );
});

TableActionHead.displayName = 'TableActionHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className = '', ...props }, ref) => (
  <td
    ref={ref}
    className={cn('p-4 align-middle text-cf-body [&:has([role=checkbox])]:pr-0', className)}
    {...props}
  />
));

TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className = '', ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-cf-subtle', className)}
    {...props}
  />
));

TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableActionHead,
  TableRow,
  TableCell,
  TableCaption,
};
