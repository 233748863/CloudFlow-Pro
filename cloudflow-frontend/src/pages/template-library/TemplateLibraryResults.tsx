import React from "react";
import { Eye, Layers3, Plus, Search, Workflow } from "lucide-react";
import { Button, EmptyState, SkeletonCard } from "@/components/common";
import { Pagination } from "@/components/common";
import { TEXT } from "./config";
import { EMPTY_GRAPH, getTemplateMetrics, normalizeTags } from "./utils";
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
  const metrics = getTemplateMetrics(
    template,
    graph,
    TEXT.uncategorized,
    TEXT.tags,
    TEXT.category,
    TEXT.nodeCount,
    TEXT.edgeCount,
  );
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

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 px-3 py-3">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <div className="mb-0.5 text-xs text-slate-400">{metric.label}</div>
              <div className="truncate text-sm font-medium text-slate-700" title={metric.value}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>

        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
        <div className="text-xs text-slate-500">
          {TEXT.templateUsage}{" "}
          <span className="font-semibold text-slate-700">{template.usageCount || 0}</span>
        </div>
        <div className="flex gap-2">
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

        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-1.5">
            <Layers3 className="h-4 w-4 text-slate-400" />
            {template.categoryName || TEXT.uncategorized}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">{TEXT.templateUsage}:</span>
            <span className="font-medium">{template.usageCount || 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">{TEXT.nodeCount}:</span>
            <span className="font-medium">{graph.nodes.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">{TEXT.edgeCount}:</span>
            <span className="font-medium">{graph.edges.length}</span>
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
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
            action={{ label: TEXT.retry, onClick: onRetry }}
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
                ? { label: TEXT.clearFilters, onClick: onClearFilters }
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
