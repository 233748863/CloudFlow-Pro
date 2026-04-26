import React from "react";
import { ArrowLeft, FolderOpen, Grid, List, Plus, Search, X } from "lucide-react";
import {
  Button,
  FilterChip,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/common";
import { TEXT } from "./config";

interface TemplateLibraryFilterBarProps {
  searchTerm: string;
  viewMode: "grid" | "list";
  hasActiveFilters: boolean;
  fromCreateFlow: boolean;
  canManageTemplates: boolean;
  selectedCategory: string;
  selectedCategoryName: string;
  selectedTags: string[];
  total: number;
  onSearchChange: (value: string) => void;
  onViewModeChange: (value: "grid" | "list") => void;
  onClearFilters: () => void;
  onClearCategory: () => void;
  onClearSearch: () => void;
  onToggleTag: (tag: string) => void;
  onBackToCreateFlow: () => void;
  onStartBlankWorkflow: () => void;
  onManageTemplates: () => void;
}

export const TemplateLibraryFilterBar: React.FC<TemplateLibraryFilterBarProps> = ({
  searchTerm,
  viewMode,
  hasActiveFilters,
  fromCreateFlow,
  canManageTemplates,
  selectedCategory,
  selectedCategoryName,
  selectedTags,
  total,
  onSearchChange,
  onViewModeChange,
  onClearFilters,
  onClearCategory,
  onClearSearch,
  onToggleTag,
  onBackToCreateFlow,
  onStartBlankWorkflow,
  onManageTemplates,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        {fromCreateFlow ? (
          <Button variant="outline" size="sm" onClick={onBackToCreateFlow} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {TEXT.backToCreate}
          </Button>
        ) : null}

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={TEXT.searchPlaceholder}
            className="pl-10"
          />
        </div>

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

      <div className="flex w-full flex-wrap items-center justify-between gap-3 xl:w-auto xl:justify-end">
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">{total} 条</div>

          {hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              <X className="h-4 w-4" />
              {TEXT.clearFilters}
            </Button>
          ) : null}

          <Tabs
            value={viewMode}
            onValueChange={(value) => onViewModeChange(value as "grid" | "list")}
          >
            <TabsList className="min-h-9">
              <TabsTrigger value="grid" className="px-3" aria-label={TEXT.gridView}>
                <Grid className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="list" className="px-3" aria-label={TEXT.listView}>
                <List className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
    </div>
  </div>
);
