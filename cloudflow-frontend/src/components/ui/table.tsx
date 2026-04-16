import React from 'react';
import { cn } from '@/utils/cn';

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className = '', ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
));

Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = '', ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'border-b border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.84),rgba(255,255,255,0.68))] [&_tr]:border-b [&_tr]:border-white/70',
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
      'border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.76),rgba(255,255,255,0.66))] font-medium [&>tr]:last:border-b-0',
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
      'border-b border-white/60 transition-colors hover:bg-white/70 data-[state=selected]:bg-pink-50/40',
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
      'px-4 py-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 whitespace-nowrap [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...props}
  />
));

TableHead.displayName = 'TableHead';

const TableActionHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className = '', ...props }, ref) => (
  <TableHead
    ref={ref}
    className={cn('text-center whitespace-nowrap', className)}
    {...props}
  />
));

TableActionHead.displayName = 'TableActionHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className = '', ...props }, ref) => (
  <td
    ref={ref}
    className={cn('p-4 align-middle text-slate-700 [&:has([role=checkbox])]:pr-0', className)}
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
    className={cn('mt-4 text-sm text-slate-500', className)}
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
