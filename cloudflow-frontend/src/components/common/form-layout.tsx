import React from 'react';
import { cn } from '@/utils/cn';
import { Label } from './label';

interface FormFieldProps {
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  hint,
  error,
  children,
  className,
  labelClassName,
}) => (
  <div className={cn('admin-dialog-field', className)}>
    {label ? (
      <Label className={cn('text-sm font-medium text-slate-700 dark:text-slate-300', labelClassName)}>
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </Label>
    ) : null}
    {children}
    {error ? <p className="text-xs leading-5 text-red-600 dark:text-red-400">{error}</p> : null}
    {!error && hint ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</p> : null}
  </div>
);

interface DialogSectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  headerAside?: React.ReactNode;
  bodyClassName?: string;
}

export const DialogSection = React.forwardRef<HTMLDivElement, DialogSectionProps>(
  ({ title, description, headerAside, bodyClassName, className, children, ...props }, ref) => (
    <section
      ref={ref}
      className={cn(
        'p-4 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950/72',
        className,
      )}
      {...props}
    >
      {title || description || headerAside ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div> : null}
            {description ? <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div> : null}
          </div>
          {headerAside ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerAside}</div> : null}
        </div>
      ) : null}
      <div className={cn('admin-dialog-stack min-w-0', bodyClassName)}>{children}</div>
    </section>
  ),
);

DialogSection.displayName = 'DialogSection';

interface DetailGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4;
}

const detailGridColumns: Record<NonNullable<DetailGridProps['columns']>, string> = {
  1: 'grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-2 xl:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
};

export const DetailGrid = React.forwardRef<HTMLDivElement, DetailGridProps>(
  ({ columns = 3, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('grid gap-x-6 gap-y-3', detailGridColumns[columns], className)}
      {...props}
    />
  ),
);

DetailGrid.displayName = 'DetailGrid';

interface DetailItemProps {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

export const DetailItem: React.FC<DetailItemProps> = ({ label, value, className, valueClassName }) => (
  <div className={cn('min-w-0 border-b border-slate-200 py-2.5 dark:border-slate-800', className)}>
    <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">{label}</div>
    <div className={cn('mt-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100', valueClassName)}>
      {value}
    </div>
  </div>
);

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  maxHeightClassName?: string;
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ maxHeightClassName = 'max-h-72', className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(maxHeightClassName, 'min-h-0 overflow-y-auto overscroll-contain pr-1', className)}
      {...props}
    />
  ),
);

ScrollArea.displayName = 'ScrollArea';
