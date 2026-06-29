import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/common';
import { cn } from '@/utils/cn';

export interface FilterBarSearch {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  /** 输入框宽度类,默认 `w-full sm:w-[260px]` */
  widthClassName?: string;
}

export interface FilterBarStat {
  label: string;
  value: React.ReactNode;
}

export interface FilterBarProps {
  /** 带 Search 图标的搜索输入框 */
  search?: FilterBarSearch;
  /** 筛选控件(通常是 Select) */
  filters?: React.ReactNode[];
  /** 内联统计 pills */
  stats?: FilterBarStat[];
  /** 右对齐操作按钮区(搜索/清空条件/新增 等) */
  actions?: React.ReactNode[];
  className?: string;
}

/**
 * 统一的列表页筛选栏。主区域承载搜索/筛选/统计,操作区保持末端对齐。
 */
export const FilterBar: React.FC<FilterBarProps> = ({ search, filters, stats, actions, className }) => (
  <div
    className={cn(
      'card cf-filter-bar flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between',
      className,
    )}
  >
    <div className="flex flex-1 flex-wrap items-center gap-3">
      {search ? (
        <div className={cn('relative', search.widthClassName ?? 'w-full sm:w-[260px]')}>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-10 pl-9"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') search.onSubmit?.();
            }}
            placeholder={search.placeholder ?? '搜索…'}
          />
        </div>
      ) : null}
      {filters?.map((node, index) => (
        <React.Fragment key={index}>{node}</React.Fragment>
      ))}
      {stats?.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {stats.map((stat, index) => (
            <span key={index} className="cf-filter-stat">
              {stat.label}
              {stat.label ? ' ' : ''}
              {stat.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
    {actions?.length ? (
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {actions.map((node, index) => (
          <React.Fragment key={index}>{node}</React.Fragment>
        ))}
      </div>
    ) : null}
  </div>
);

export default FilterBar;
