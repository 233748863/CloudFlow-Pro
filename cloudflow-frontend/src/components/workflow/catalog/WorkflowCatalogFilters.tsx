import React from 'react';
import { Button } from '@/components/ui';
import { SearchInput } from '@/components/common';

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
  <div className="card">
    <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">流程筛选</h2>
        <p className="mt-1 text-sm text-slate-500">按名称、分类和标签快速定位可发起流程。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="badge badge-gray">标签池 {allTags.length} 个</span>
        <span className="badge badge-gray">已缓存表单 {savedFormsCount} 个</span>
      </div>
    </div>

    <div className="space-y-4 p-6">
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
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
            当前未应用额外筛选
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {categoryOptions.map((option) => {
          const active = selectedCategory === option.value;
          return (
            <button
              key={option.value || 'ALL'}
              type="button"
              onClick={() => onCategoryChange(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/20'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-teal-600'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {allTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-gray">标签筛选</span>
          {allTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onTagToggle(tag)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/20'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-teal-600'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  </div>
);
