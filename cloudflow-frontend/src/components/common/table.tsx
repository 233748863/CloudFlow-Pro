import React from 'react';
import { cn } from '@/utils/cn';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string;
  disableScrollWrapper?: boolean;
}

const Table = React.forwardRef<
  HTMLTableElement,
  TableProps
>(({ className = '', wrapperClassName = '', disableScrollWrapper = false, ...props }, ref) => {
  const tableElement = (
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  );

  if (disableScrollWrapper) {
    return tableElement;
  }

  return (
    <div className={cn('relative w-full overflow-auto', wrapperClassName)}>
      {tableElement}
    </div>
  );
});

Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = '', ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'border-b border-slate-200 bg-slate-50 [&_tr]:border-b [&_tr]:border-slate-200',
      'dark:border-slate-800 dark:bg-slate-900/70 dark:[&_tr]:border-slate-800',
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
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
));

TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = '', ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-slate-200 bg-slate-50 font-medium [&>tr]:last:border-b-0',
      'dark:border-slate-800 dark:bg-slate-900/70',
      className,
    )}
    {...props}
  />
));

TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className = '', ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-slate-100 transition-colors hover:bg-slate-50 data-[state=selected]:bg-cyan-50/40 dark:border-slate-800 dark:hover:bg-slate-900/80 dark:data-[state=selected]:bg-cyan-950/30',
      className,
    )}
    {...props}
  />
));

TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className = '', ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'px-4 py-3 text-left align-middle text-sm font-medium normal-case tracking-normal whitespace-nowrap text-slate-500 dark:text-slate-400 [&:has([role=checkbox])]:pr-0',
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
    className={cn('p-4 align-middle text-slate-700 dark:text-slate-200 [&:has([role=checkbox])]:pr-0', className)}
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
    className={cn('mt-4 text-sm text-slate-500 dark:text-slate-400', className)}
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
