import React from "react";
import { ArrowRight, Plus, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/common";
import { BaseDialog } from "@/components/common/BaseDialog";
import { InnerTableSurface } from "@/components/layout/TablePageLayout";
import { TEXT } from "./config";
import { formatNodeType } from "./utils";
import type { ParsedTemplateGraph, TemplateItem } from "./types";

interface TemplateLibraryPreviewDialogProps {
  open: boolean;
  template: TemplateItem | null;
  previewGraph: ParsedTemplateGraph;
  previewTags: string[];
  previewNodeTypes: string[];
  previewOverviewStats: Array<{ label: string; value: string }>;
  userLoggedIn: boolean;
  onOpenChange: (open: boolean) => void;
  onUseTemplate: (templateId: string) => void;
}

const TemplatePreviewImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [loadFailed, setLoadFailed] = React.useState(false);

  React.useEffect(() => {
    setLoadFailed(false);
  }, [src]);

  if (loadFailed) {
    return null;
  }

  return (
    <InnerTableSurface wrapperClassName="p-0">
      <img
        src={src}
        alt={alt}
        className="max-h-[220px] w-full object-cover"
        onError={() => setLoadFailed(true)}
      />
    </InnerTableSurface>
  );
};

const PreviewSection: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}> = ({ title, description, children, bodyClassName }) => (
  <InnerTableSurface wrapperClassName="p-0">
    <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        {typeof title === "string" ? (
          <div className="text-sm font-semibold text-cf-title">{title}</div>
        ) : title}
        {description ? (
          <p className="mt-1 text-xs leading-5 text-cf-subtle">{description}</p>
        ) : null}
      </div>
    </div>
    <div className={bodyClassName}>{children}</div>
  </InnerTableSurface>
);

export const TemplateLibraryPreviewDialog: React.FC<TemplateLibraryPreviewDialogProps> = ({
  open,
  template,
  previewGraph,
  previewTags,
  previewNodeTypes,
  previewOverviewStats,
  userLoggedIn,
  onOpenChange,
  onUseTemplate,
}) => {
  if (!open || !template) {
    return null;
  }

  const nodeNameMap = new Map(
    previewGraph.nodes.map((node) => [node.id, node.name]),
  );

  return (
    <BaseDialog
      open={open}
      title={template.name}
      description={template.description || TEXT.noDescription}
      width="full"
      onClose={() => onOpenChange(false)}
      bodyClassName="admin-dialog-stack"
      headerAside={
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-cf-muted dark:border-slate-800 dark:bg-slate-900">
            {template.categoryName || TEXT.uncategorized}
          </span>
          {template.isSystem ? (
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-600 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
              {TEXT.systemTemplate}
            </span>
          ) : null}
        </div>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {TEXT.close}
          </Button>
          <Button
            disabled={!userLoggedIn}
            onClick={() => {
              onOpenChange(false);
              onUseTemplate(template.id);
            }}
            title={!userLoggedIn ? TEXT.loginRequired : TEXT.useTemplateTitle}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {TEXT.useTemplate}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-col gap-4">
          {template.previewImage ? (
            <TemplatePreviewImage
              src={template.previewImage}
              alt={`${template.name} preview`}
            />
          ) : null}

          <PreviewSection title={TEXT.previewOverview}>
            <dl className="divide-y divide-slate-200 dark:divide-slate-800">
              {previewOverviewStats.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <dt className="text-sm text-cf-subtle">{item.label}</dt>
                  <dd
                    className="max-w-[160px] truncate text-sm font-medium text-cf-title"
                    title={item.value}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </PreviewSection>

          <PreviewSection title={TEXT.tags} bodyClassName="flex flex-wrap gap-2 px-4 py-4">
            {previewTags.length > 0 ? (
              previewTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2 py-1 text-xs text-cf-muted dark:border-slate-800 dark:bg-slate-900"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-sm text-cf-faint">-</span>
            )}
          </PreviewSection>

          <PreviewSection title={TEXT.nodeTypes} bodyClassName="flex flex-wrap gap-2 px-4 py-4">
            {previewNodeTypes.length > 0 ? (
              previewNodeTypes.map((type) => (
                <span
                  key={type}
                  className="inline-flex items-center rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2 py-1 text-xs text-cf-muted dark:border-slate-800 dark:bg-slate-900"
                >
                  {type}
                </span>
              ))
            ) : (
              <span className="text-sm text-cf-faint">-</span>
            )}
          </PreviewSection>
        </div>

        <div className="flex flex-col gap-4">
          <PreviewSection
            title={(
              <div className="flex items-center gap-2 text-sm font-semibold text-cf-title">
                <Sparkles className="h-4 w-4 text-cyan-600" />
                {TEXT.previewStructure}
              </div>
            )}
            description={TEXT.previewStructureDesc}
          >
            {previewGraph.nodes.length > 0 ? (
              <div className="admin-horizontal-scroll px-4 py-4">
                <div className="flex min-w-max items-center gap-3">
                  {previewGraph.nodes.slice(0, 8).map((node, index) => (
                    <React.Fragment key={node.id}>
                      <div className="min-w-[180px] rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="text-[11px] text-cf-faint">
                          {formatNodeType(node.type)}
                        </div>
                        <div
                          className="mt-1 truncate text-sm font-medium text-cf-title"
                          data-tooltip={node.name}
                        >
                          {node.name}
                        </div>
                      </div>
                      {index < Math.min(previewGraph.nodes.length - 1, 7) ? (
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                      ) : null}
                    </React.Fragment>
                  ))}
                  {previewGraph.nodes.length > 8 ? (
                    <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 text-sm font-medium text-cf-faint dark:border-slate-800 dark:bg-slate-950">
                      +{previewGraph.nodes.length - 8}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="px-6 py-10 text-center">
                <Workflow className="mx-auto mb-4 h-10 w-10 text-slate-200 dark:text-slate-700" />
                <p className="text-sm leading-6 text-cf-subtle">{TEXT.invalidDefinition}</p>
              </div>
            )}
          </PreviewSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <PreviewSection title={TEXT.nodeList} bodyClassName="max-h-[320px] overflow-y-auto">
                {previewGraph.nodes.length === 0 ? (
                  <div className="flex items-center justify-center px-4 py-10 text-sm text-cf-faint">
                    {TEXT.invalidDefinition}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {previewGraph.nodes.map((node) => (
                      <div
                        key={node.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <span className="truncate text-sm font-medium text-cf-title">
                          {node.name}
                        </span>
                        <span className="shrink-0 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2 py-1 text-[11px] text-cf-subtle dark:border-slate-800 dark:bg-slate-900">
                          {formatNodeType(node.type)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </PreviewSection>

            <PreviewSection title={TEXT.edgeList} bodyClassName="max-h-[320px] overflow-y-auto">
                {previewGraph.edges.length === 0 ? (
                  <div className="flex items-center justify-center px-4 py-10 text-sm text-cf-faint">
                    {TEXT.edgeNotFound}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {previewGraph.edges.map((edge, index) => (
                      <div key={`${edge.source}-${edge.target}-${index}`} className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-cf-body">
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {nodeNameMap.get(edge.source) || edge.source}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {nodeNameMap.get(edge.target) || edge.target}
                          </span>
                        </div>
                        {edge.condition ? (
                          <div className="mt-2 text-xs leading-5 text-cf-subtle">
                            {edge.condition}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
            </PreviewSection>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
};
