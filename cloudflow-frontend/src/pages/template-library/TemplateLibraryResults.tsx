import React from "react";
import { Eye, GitBranch, Layers3, Plus, Search, ShieldCheck, Workflow } from "lucide-react";
import { Button, EmptyState, Pagination } from "@/components/common";
import { InnerTableSurface } from "@/components/layout/TablePageLayout";
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
  hasActiveFilters: boolean;
  userLoggedIn: boolean;
  templateInsights: Map<string, ParsedTemplateGraph>;
  onRetry: () => void;
  onClearFilters: () => void;
  onPreview: (template: TemplateItem) => void;
  onUseTemplate: (templateId: string) => void;
  onPageChange: (page: number) => void;
}

const TemplateSkeletonCards = () => (
  <div className="template-market-grid">
    {Array.from({ length: 6 }).map((_, index) => (
      <article key={index} className="template-market-card template-market-card-skeleton">
        <div className="template-market-card-head">
          <span className="template-market-skeleton-icon" />
          <span className="template-market-skeleton-line is-title" />
        </div>
        <span className="template-market-skeleton-line is-meta" />
        <span className="template-market-skeleton-line is-wide" />
        <span className="template-market-skeleton-line is-wide" />
        <div className="template-market-skeleton-metrics">
          <span />
          <span />
          <span />
        </div>
      </article>
    ))}
  </div>
);

const compactLabel = (value: string, maxLength = 18) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const TemplateCard: React.FC<{
  template: TemplateItem;
  graph: ParsedTemplateGraph;
  userLoggedIn: boolean;
  onPreview: (template: TemplateItem) => void;
  onUseTemplate: (templateId: string) => void;
}> = ({ template, graph, userLoggedIn, onPreview, onUseTemplate }) => {
  const tags = normalizeTags(template.tags);
  const previewNodes = graph.nodes.slice(0, 3);

  return (
    <article className="template-market-card">
      <div className="template-market-card-head">
        <span className={`template-market-card-icon ${template.isSystem ? "is-system" : "is-custom"}`}>
          {template.isSystem ? <ShieldCheck size={18} /> : <Workflow size={18} />}
        </span>
        <button type="button" title={template.name} onClick={() => onPreview(template)}>
          {template.name}
        </button>
      </div>

      <div className="template-market-card-meta">
        <span>{template.categoryName || TEXT.uncategorized}</span>
        <span>{template.isSystem ? TEXT.systemTemplate : "自定义"}</span>
        <span>{template.usageCount || 0} 次使用</span>
      </div>

      <p className="template-market-card-desc">{template.description || TEXT.noDescription}</p>

      <div className="template-market-structure" aria-label="模板结构">
        <div>
          <strong>{graph.nodes.length}</strong>
          <span>{TEXT.nodeCount}</span>
        </div>
        <div>
          <strong>{graph.edges.length}</strong>
          <span>{TEXT.edgeCount}</span>
        </div>
        <div>
          <strong>{tags.length}</strong>
          <span>{TEXT.tags}</span>
        </div>
      </div>

      <div className="template-market-node-strip">
        {previewNodes.length > 0 ? (
          previewNodes.map((node) => (
            <span key={node.id} title={node.name}>
              <GitBranch size={12} />
              <em>{compactLabel(node.name)}</em>
            </span>
          ))
        ) : (
          <span title={TEXT.invalidDefinition}>
            <Layers3 size={12} />
            <em>未解析到流程定义</em>
          </span>
        )}
      </div>

      <div className="template-market-card-tags">
        {(tags.length > 0 ? tags.slice(0, 4) : [template.categoryName || TEXT.uncategorized]).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        {tags.length > 4 ? <span>+{tags.length - 4}</span> : null}
      </div>

      <div className="template-market-card-actions">
        <Button variant="outline" size="sm" onClick={() => onPreview(template)}>
          <Eye className="h-3.5 w-3.5" />
          {TEXT.preview}
        </Button>
        <Button
          size="sm"
          disabled={!userLoggedIn}
          title={!userLoggedIn ? TEXT.loginRequired : TEXT.useTemplateTitle}
          onClick={() => onUseTemplate(template.id)}
        >
          <Plus className="h-3.5 w-3.5" />
          {TEXT.useTemplate}
        </Button>
      </div>
    </article>
  );
};

export const TemplateLibraryResults: React.FC<TemplateLibraryResultsProps> = ({
  templates,
  loading,
  loadError,
  total,
  pageSize,
  currentPage,
  hasActiveFilters,
  userLoggedIn,
  templateInsights,
  onRetry,
  onClearFilters,
  onPreview,
  onUseTemplate,
  onPageChange,
}) => (
  <InnerTableSurface
    className="template-market-results flex min-h-0 flex-1 flex-col"
    wrapperClassName="template-market-results-wrapper"
  >
    <div className="template-market-results-head admin-source-panel-head">
      <div>
        <h3>{TEXT.currentResults}</h3>
      </div>
      <span>
        {templates.length} / {total} 个模板
      </span>
    </div>

    <div className="template-market-results-body">
      {loadError ? (
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
      ) : loading ? (
        <TemplateSkeletonCards />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<Search className="h-12 w-12 text-slate-300" />}
          title={TEXT.emptyTitle}
          description={TEXT.emptyDescription}
          action={
            hasActiveFilters ? (
              <Button variant="outline" onClick={onClearFilters}>
                {TEXT.clearFilters}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="template-market-grid">
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
      )}
    </div>

    {total > pageSize ? (
      <div className="template-market-pagination">
        <Pagination
          total={total}
          page={currentPage}
          pageSize={pageSize}
          showPageSizeSelector={false}
          onPageChange={onPageChange}
          onPageSizeChange={() => undefined}
        />
      </div>
    ) : null}
  </InnerTableSurface>
);
