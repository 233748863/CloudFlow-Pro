import React from "react";
import { ArrowLeft, FolderOpen, Plus, Search, X } from "lucide-react";
import {
  Button,
  FilterChip,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/common";
import { TEXT } from "./config";
import type { CategoryNode } from "./types";

interface TemplateLibraryToolbarProps {
  searchTerm: string;
  hasActiveFilters: boolean;
  fromCreateFlow: boolean;
  canManageTemplates: boolean;
  categories: CategoryNode[];
  recommendedTags: string[];
  selectedCategory: string;
  selectedCategoryName: string;
  selectedTags: string[];
  total: number;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onClearFilters: () => void;
  onClearCategory: () => void;
  onClearSearch: () => void;
  onToggleTag: (tag: string) => void;
  onBackToCreateFlow: () => void;
  onStartBlankWorkflow: () => void;
  onManageTemplates: () => void;
}

const flattenCategories = (
  nodes: CategoryNode[],
  level = 0,
): Array<{ id: string; name: string; label: string; count: number }> =>
  nodes.flatMap((node) => {
    const current = {
      id: node.id,
      name: node.name,
      label: `${"　".repeat(level)}${node.name}`,
      count: Number(node.templateCount || 0),
    };

    return [
      current,
      ...flattenCategories(Array.isArray(node.children) ? node.children : [], level + 1),
    ];
  });

export const TemplateLibraryToolbar: React.FC<TemplateLibraryToolbarProps> = ({
  searchTerm,
  hasActiveFilters,
  fromCreateFlow,
  canManageTemplates,
  categories,
  recommendedTags,
  selectedCategory,
  selectedCategoryName,
  selectedTags,
  total,
  onSearchChange,
  onCategoryChange,
  onClearFilters,
  onClearCategory,
  onClearSearch,
  onToggleTag,
  onBackToCreateFlow,
  onStartBlankWorkflow,
  onManageTemplates,
}) => {
  const categoryOptions = React.useMemo(() => flattenCategories(categories), [categories]);

  return (
    <section className="template-market-filter-panel">
      <div className="template-market-filter-grid">
        <label className="template-market-field">
          <span>关键词</span>
          <div className="template-market-search-field">
            <Search aria-hidden="true" />
            <Input
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={TEXT.searchPlaceholder}
            />
          </div>
        </label>

        <label className="template-market-field">
          <span>分类</span>
          <Select value={selectedCategory} onValueChange={onCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder={TEXT.allTemplates} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" label={TEXT.allTemplates}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{TEXT.allTemplates}</span>
                  <span className="text-xs text-slate-400">{total}</span>
                </span>
              </SelectItem>
              {categoryOptions.map((category) => (
                <SelectItem key={category.id} value={category.id} label={category.name}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="truncate">{category.label}</span>
                    {category.count > 0 ? (
                      <span className="text-xs text-slate-400">{category.count}</span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="template-market-filter-actions">
          <span className="template-market-count">当前 {total} 项</span>
          {fromCreateFlow ? (
            <Button variant="outline" size="sm" onClick={onBackToCreateFlow} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              {TEXT.backToCreate}
            </Button>
          ) : null}
          {hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              <X className="h-4 w-4" />
              {TEXT.clearFilters}
            </Button>
          ) : null}
          {fromCreateFlow ? (
            <Button size="sm" onClick={onStartBlankWorkflow} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {TEXT.createBlank}
            </Button>
          ) : null}
          {canManageTemplates ? (
            <Button variant="outline" size="sm" onClick={onManageTemplates} className="gap-1.5">
              <FolderOpen className="h-4 w-4" />
              管理模板
            </Button>
          ) : null}
        </div>
      </div>

      <div className="template-market-filter-tags">
        <span>{TEXT.commonTags}</span>
        {recommendedTags.map((tag) => (
          <FilterChip
            key={tag}
            active={selectedTags.includes(tag)}
            onClick={() => onToggleTag(tag)}
          >
            {tag}
          </FilterChip>
        ))}
      </div>

      {selectedCategory || searchTerm.trim() || selectedTags.length ? (
        <div className="template-market-active-filters">
          {selectedCategory ? (
            <FilterChip type="button" onClick={onClearCategory}>
              {selectedCategoryName}
              <X className="ml-2 h-3.5 w-3.5" />
            </FilterChip>
          ) : null}

          {searchTerm.trim() ? (
            <FilterChip type="button" onClick={onClearSearch}>
              {searchTerm.trim()}
              <X className="ml-2 h-3.5 w-3.5" />
            </FilterChip>
          ) : null}

          {selectedTags.map((tag) => (
            <FilterChip key={tag} type="button" onClick={() => onToggleTag(tag)}>
              {tag}
              <X className="ml-2 h-3.5 w-3.5" />
            </FilterChip>
          ))}
        </div>
      ) : null}
    </section>
  );
};
