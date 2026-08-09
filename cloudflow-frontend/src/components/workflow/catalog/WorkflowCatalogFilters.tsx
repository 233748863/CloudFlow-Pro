import React from 'react';
import { Button, FilterChip } from '@/components/common';
import { SearchInput } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

interface WorkflowCategoryOption {
  label: string;
  value: string;
}

interface WorkflowCatalogFiltersProps {
  searchTerm: string;
  selectedCategory: string;
  selectedTags: string[];
  allTags: string[];
  categoryOptions: WorkflowCategoryOption[];
  savedFormsCount: number;
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onTagToggle: (tag: string) => void;
  onClearFilters: () => void;
}

export const WorkflowCatalogFilters: React.FC<WorkflowCatalogFiltersProps> = ({
  searchTerm,
  selectedCategory,
  selectedTags,
  allTags,
  categoryOptions,
  savedFormsCount,
  hasActiveFilters,
  onSearchChange,
  onCategoryChange,
  onTagToggle,
  onClearFilters,
}) => (
  <InnerTableSurface className="overflow-hidden">
    <div className="p-4 admin-source-section-head border-b border-slate-200 dark:border-slate-800">
      <div>
        <strong>流程筛选</strong>
        <span>
          按名称、分类和标签快速定位可发起流程。
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="badge badge-gray">标签池 {allTags.length}</span>
        <span className="badge badge-gray">已缓存表单 {savedFormsCount}</span>
      </div>
    </div>

    <div className="p-4 admin-dialog-stack">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <SearchInput
          value={searchTerm}
          placeholder="按流程名称搜索"
          onChange={onSearchChange}
        />
        {hasActiveFilters ? (
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            清空筛选
          </Button>
        ) : (
          <div className="p-4 inline-flex min-h-10 items-center border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-2 text-xs text-cf-faint dark:border-slate-800 dark:bg-slate-900">
            当前未应用额外筛选
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {categoryOptions.map((option) => {
          const active = selectedCategory === option.value;
          return (
            <FilterChip
              key={option.value || 'ALL'}
              active={active}
              onClick={() => onCategoryChange(option.value)}
            >
              {option.label}
            </FilterChip>
          );
        })}
      </div>

      {allTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-gray">标签筛选</span>
          {allTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <FilterChip
                key={tag}
                active={active}
                onClick={() => onTagToggle(tag)}
              >
                {tag}
              </FilterChip>
            );
          })}
        </div>
      ) : null}
    </div>
  </InnerTableSurface>
);
