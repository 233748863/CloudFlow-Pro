import React from 'react';
import { LoadingSpinner, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { cn } from '@/utils/cn';

export const infrastructureCheckboxClassName =
  'h-4 w-4 rounded border-slate-300 accent-[#0d95b5] focus:ring-2 focus:ring-[#0d95b5]/30 dark:border-slate-700 dark:bg-slate-950';

/**
 * 基础设施类页面的下拉框。原来渲染原生 select，和全项目 102 个页面共用的 Select
 * 视觉完全不一致（原生控件不吃主题变量、箭头和展开面板都是浏览器默认样式），
 * 消息中心几个页面看起来像外来页面就是这个原因。这里改成共用 Select 的薄封装，
 * 保留 options 数组入参，让 13 个调用页一次性对齐项目风格。
 */
export const InfrastructureSelect: React.FC<{
  options: ReadonlyArray<{ value: string; label: string }>;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}> = ({ options, value, onValueChange, disabled, placeholder, className, 'aria-label': ariaLabel }) => (
  <Select value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger className={cn('h-9 min-h-9', className)} aria-label={ariaLabel}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const InfrastructurePageHeader: React.FC<{
  kicker: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}> = ({ kicker, title, description, children }) => (
  <header className="admin-source-header">
    <div>
      <p className="admin-source-kicker">{kicker}</p>
      <h2>{title}</h2>
      <span>{description}</span>
    </div>
    {children ? <div className="admin-source-controls">{children}</div> : null}
  </header>
);

export type InfrastructureStat = {
  label: string;
  value: string;
  meta: string;
  icon: React.ReactNode;
  tone: 'blue' | 'green' | 'amber' | 'violet';
};

export const InfrastructureStats: React.FC<{ items: InfrastructureStat[] }> = ({ items }) => (
  <section className="admin-source-stat-grid">
    {items.map((item) => (
      <article
        key={item.label}
        className={cn('card admin-source-stat', `admin-source-tone-${item.tone}`)}
      >
        <div className="admin-source-stat-icon">{item.icon}</div>
        <div>
          <p>{item.label}</p>
          <strong>{item.value}</strong>
          <span>{item.meta}</span>
        </div>
      </article>
    ))}
  </section>
);

export const InfrastructureTableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr className="hover:bg-transparent dark:hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-12">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <p className="text-sm font-medium text-cf-title">{title}</p>
        {description ? <p className="mt-2 text-xs leading-6 text-cf-subtle">{description}</p> : null}
      </div>
    </td>
  </tr>
);

export const InfrastructureBadge: React.FC<{
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info';
}> = ({ children, tone = 'neutral' }) => {
  const tones = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200',
    info: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200',
  };

  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
};

export const InfrastructureField: React.FC<{
  label: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ label, hint, className, children }) => (
  <label className={cn('admin-dialog-field', className)}>
    <span className="input-label">{label}</span>
    {children}
    {hint ? <span className="mt-1 text-xs leading-5 text-cf-subtle">{hint}</span> : null}
  </label>
);

/**
 * 弹窗内的分区壳。资产、印章、证照、日程等页面各自本地定义了同形状的 DialogPanel，
 * 基础设施这几个页面共用一套 primitives，所以收在这里，避免在 5 个页面各抄一份。
 */
export const InfrastructureDialogPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, description, actions, className, bodyClassName, children }) => (
  <section className={cn('table-scroll-container admin-inner-table-surface', className)}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={cn('p-4', bodyClassName)}>{children}</div>
  </section>
);

/** 详情弹窗里的单个字段项。value 传 0 之类的 falsy 值时请先转成字符串。 */
export const InfrastructureDetailField: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className="admin-message-detail-item">
    <div className="text-[11px] font-medium text-cf-faint">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-cf-title">{value || '-'}</div>
  </div>
);
