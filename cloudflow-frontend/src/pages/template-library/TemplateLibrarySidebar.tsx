import React from "react";
import { FolderOpen, Layers3 } from "lucide-react";
import { FilterChip, SideNavItem } from "@/components/ui";
import { TEXT } from "./config";
import type { CategoryNode } from "./types";

interface TemplateLibrarySidebarProps {
  categories: CategoryNode[];
  total: number;
  selectedCategory: string;
  recommendedTags: string[];
  selectedTags: string[];
  onCategoryChange: (categoryId: string) => void;
  onToggleTag: (tag: string) => void;
}

const CategoryTree: React.FC<{
  nodes: CategoryNode[];
  selectedCategory: string;
  level?: number;
  onCategoryChange: (categoryId: string) => void;
}> = ({ nodes, selectedCategory, level = 0, onCategoryChange }) => (
  <>
    {nodes.map((node) => {
      const active = selectedCategory === node.id;

      return (
        <div key={node.id} className="space-y-1">
          <SideNavItem
            size="sm"
            active={active}
            onClick={() => onCategoryChange(node.id)}
            className="w-full justify-start"
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            <FolderOpen className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
            <span className="flex-1 truncate text-left">{node.name}</span>
            {Number(node.templateCount || 0) > 0 ? (
              <span className="ml-2 text-xs text-slate-500">
                {node.templateCount}
              </span>
            ) : null}
          </SideNavItem>

          {Array.isArray(node.children) && node.children.length > 0 ? (
            <CategoryTree
              nodes={node.children}
              selectedCategory={selectedCategory}
              level={level + 1}
              onCategoryChange={onCategoryChange}
            />
          ) : null}
        </div>
      );
    })}
  </>
);

export const TemplateLibrarySidebar: React.FC<TemplateLibrarySidebarProps> = ({
  categories,
  total,
  selectedCategory,
  recommendedTags,
  selectedTags,
  onCategoryChange,
  onToggleTag,
}) => (
  <div className="space-y-4">
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="text-sm font-semibold text-slate-950">{TEXT.categoryNavigation}</div>
      </div>

      <div className="space-y-1 p-2">
        <SideNavItem
          type="button"
          size="sm"
          active={!selectedCategory}
          onClick={() => onCategoryChange("")}
          className="w-full justify-start"
        >
          <Layers3 className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
          <span className="flex-1 text-left">{TEXT.allTemplates}</span>
          <span className="ml-2 text-xs text-slate-500">{total}</span>
        </SideNavItem>

        {categories.length > 0 ? (
          <CategoryTree
            nodes={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={onCategoryChange}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
            {TEXT.noCategoryDesc}
          </div>
        )}
      </div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="text-sm font-semibold text-slate-950">{TEXT.commonTags}</div>
      </div>

      <div className="flex flex-wrap gap-2 p-4">
        {recommendedTags.map((tag) => {
          const active = selectedTags.includes(tag);
          return (
            <FilterChip key={tag} active={active} onClick={() => onToggleTag(tag)}>
              {tag}
            </FilterChip>
          );
        })}
      </div>
    </div>
  </div>
);
