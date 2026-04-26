import React from "react";
import { Eye, Layers3, Plus, Search, Workflow } from "lucide-react";
import { Button, EmptyState, SkeletonCard } from "@/components/common";
import { Pagination } from "@/components/common";
import { TEXT } from "./config";
import { EMPTY_GRAPH, normalizeTags } from "./utils";
import type { ParsedTemplateGraph, TemplateItem } from "./types";

interface TemplateLibraryResultsProps {
  templates: TemplateItem[];
  loading: boolean;
  loadError: string;
  total: number;
  pageSize: number;
  currentPage: number;
  viewMode: "grid" | "list";
  hasActiveFilters: boolean;
  userLoggedIn: boolean;
  templateInsights: Map<string, ParsedTemplateGraph>;
  onRetry: () => void;
  onClearFilters: () => void;
  onPreview: (template: TemplateItem) => void;
  onUseTemplate: (templateId: string) => void;
  onPageChange: (page: number) => void;
}

const renderLoadingState = (viewMode: "grid" | "list") => (
  <div
    className={
      viewMode === "grid"
        ? "grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3"
        : "space-y-0"
    }
  >
    {Array.from({ length: viewMode === "grid" ? 6 : 4 }).map((_, index) => (
      <SkeletonCard key={index} className={viewMode === "list" ? "rounded-none border-0 shadow-none" : ""} />
    ))}
  </div>
);

const TemplateCard: React.FC<{
  template: TemplateItem;
  graph: ParsedTemplateGraph;
  userLoggedIn: boolean;
  onPreview: (template: TemplateItem) => void;
  onUseTemplate: (templateId: string) => void;
}> = ({ template, graph, userLoggedIn, onPreview, onUseTemplate }) => {
  const tags = normalizeTags(template.tags);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300">
      <div className="flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-500">
            <Layers3 className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
            {template.categoryName || TEXT.uncategorized}
          </span>
          {template.isSystem ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-600 ring-1 ring-emerald-100">
              {TEXT.systemTemplate}
            </span>
          ) : null}
        </div>

        <div className="mt-3">
          <h3 className="line-clamp-1 text-base font-semibold tracking-tight text-slate-900">
            {template.name}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">
            {template.description || TEXT.noDescription}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-600">
            {TEXT.nodeCount} {graph.nodes.length}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-600">
            {TEXT.edgeCount} {graph.edges.length}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-600">
            {TEXT.templateUsage} {template.usageCount || 0}
          </span>
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <Button variant="outline" size="sm" onClick={() => onPreview(template)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          {TEXT.preview}
        </Button>
        <Button
          size="sm"
          disabled={!userLoggedIn}
          onClick={() => onUseTemplate(template.id)}
          title={!userLoggedIn ? TEXT.loginRequired : TEXT.useTemplateTitle}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {TEXT.useTemplate}
        </Button>
      </div>
    </div>
  );
};

const TemplateRow: React.FC<{
  template: TemplateItem;
  graph: ParsedTemplateGraph;
  userLoggedIn: boolean;
  onPreview: (template: TemplateItem) => void;
  onUseTemplate: (templateId: string) => void;
}> = ({ template, graph, userLoggedIn, onPreview, onUseTemplate }) => {
  const tags = normalizeTags(template.tags);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-slate-50/80 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold text-slate-900">{template.name}</h3>
          {template.isSystem ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-100">
              {TEXT.systemTemplate}
            </span>
          ) : null}
        </div>

        <p className="mb-3 line-clamp-2 text-sm text-slate-500">
          {template.description || TEXT.noDescription}
        </p>

        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
            <Layers3 className="mr-1.5 h-4 w-4 text-slate-400" />
            {template.categoryName || TEXT.uncategorized}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
            {TEXT.nodeCount} {graph.nodes.length}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
            {TEXT.edgeCount} {graph.edges.length}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
            {TEXT.templateUsage} {template.usageCount || 0}
          </span>
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 lg:self-start">
        <Button variant="outline" size="sm" onClick={() => onPreview(template)}>
          <Eye className="mr-2 h-4 w-4" />
          {TEXT.preview}
        </Button>
        <Button
          size="sm"
          disabled={!userLoggedIn}
          onClick={() => onUseTemplate(template.id)}
          title={!userLoggedIn ? TEXT.loginRequired : TEXT.useTemplateTitle}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {TEXT.useTemplate}
        </Button>
      </div>
    </div>
  );
};

export const TemplateLibraryResults: React.FC<TemplateLibraryResultsProps> = ({
  templates,
  loading,
  loadError,
  total,
  pageSize,
  currentPage,
  viewMode,
  hasActiveFilters,
  userLoggedIn,
  templateInsights,
  onRetry,
  onClearFilters,
  onPreview,
  onUseTemplate,
  onPageChange,
}) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="min-h-[280px]">
      {loading ? (
        <div className="px-4 py-4">{renderLoadingState(viewMode)}</div>
      ) : loadError ? (
        <div className="px-4 py-4">
          <EmptyState
            icon={<Workflow className="h-12 w-12 text-slate-300" />}
            title={TEXT.loadTemplatesFailed}
            description={TEXT.emptyDescription}
            action={
              <Button variant="outline" onClick={onRetry}>
                {TEXT.retry}
              </Button>
            }
          />
        </div>
      ) : templates.length === 0 ? (
        <div className="px-4 py-4">
          <EmptyState
            icon={<Search className="h-12 w-12 text-slate-300" />}
            title={TEXT.emptyTitle}
            description={TEXT.emptyDescription}
            action={
              hasActiveFilters
                ? (
                  <Button variant="outline" onClick={onClearFilters}>
                    {TEXT.clearFilters}
                  </Button>
                )
                : undefined
            }
          />
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-2 2xl:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              graph={templateInsights.get(template.id) || EMPTY_GRAPH}
              userLoggedIn={userLoggedIn}
              onPreview={onPreview}
              onUseTemplate={onUseTemplate}
            />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              graph={templateInsights.get(template.id) || EMPTY_GRAPH}
              userLoggedIn={userLoggedIn}
              onPreview={onPreview}
              onUseTemplate={onUseTemplate}
            />
          ))}
        </div>
      )}
    </div>

    {total > pageSize ? (
      <Pagination
        total={total}
        page={currentPage}
        pageSize={pageSize}
        showPageSizeSelector={false}
        onPageChange={onPageChange}
        onPageSizeChange={() => undefined}
      />
    ) : null}
  </div>
);
