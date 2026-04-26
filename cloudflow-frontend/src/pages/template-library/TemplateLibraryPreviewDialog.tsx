import React from "react";
import { ArrowRight, Plus, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/common";
import { BaseDialog } from "@/components/common/BaseDialog";
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
      bodyClassName="space-y-4"
      headerAside={
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
            {template.categoryName || TEXT.uncategorized}
          </span>
          {template.isSystem ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-600">
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
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          {template.previewImage ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img
                src={template.previewImage}
                alt={`${template.name} preview`}
                className="max-h-[220px] w-full object-cover"
              />
            </div>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">
              {TEXT.previewOverview}
            </div>
            <dl className="divide-y divide-slate-100">
              {previewOverviewStats.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <dt className="text-sm text-slate-500">{item.label}</dt>
                  <dd
                    className="max-w-[160px] truncate text-sm font-medium text-slate-800"
                    title={item.value}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">
              {TEXT.tags}
            </div>
            <div className="flex flex-wrap gap-2 px-4 py-4">
              {previewTags.length > 0 ? (
                previewTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400">-</span>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">
              {TEXT.nodeTypes}
            </div>
            <div className="flex flex-wrap gap-2 px-4 py-4">
              {previewNodeTypes.length > 0 ? (
                previewNodeTypes.map((type) => (
                  <span
                    key={type}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                  >
                    {type}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400">-</span>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Sparkles className="h-4 w-4 text-teal-600" />
                {TEXT.previewStructure}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {TEXT.previewStructureDesc}
              </p>
            </div>

            {previewGraph.nodes.length > 0 ? (
              <div className="overflow-x-auto px-4 py-4">
                <div className="flex min-w-max items-center gap-3">
                  {previewGraph.nodes.slice(0, 8).map((node, index) => (
                    <React.Fragment key={node.id}>
                      <div className="min-w-[180px] rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-[11px] text-slate-400">
                          {formatNodeType(node.type)}
                        </div>
                        <div
                          className="mt-1 truncate text-sm font-medium text-slate-800"
                          title={node.name}
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
                    <div className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm font-medium text-slate-400">
                      +{previewGraph.nodes.length - 8}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="px-6 py-14 text-center">
                <Workflow className="mx-auto mb-4 h-10 w-10 text-slate-200" />
                <p className="text-sm leading-6 text-slate-500">{TEXT.invalidDefinition}</p>
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">
                {TEXT.nodeList}
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {previewGraph.nodes.length === 0 ? (
                  <div className="flex items-center justify-center px-4 py-14 text-sm text-slate-400">
                    {TEXT.invalidDefinition}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {previewGraph.nodes.map((node) => (
                      <div
                        key={node.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <span className="truncate text-sm font-medium text-slate-800">
                          {node.name}
                        </span>
                        <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                          {formatNodeType(node.type)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">
                {TEXT.edgeList}
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {previewGraph.edges.length === 0 ? (
                  <div className="flex items-center justify-center px-4 py-14 text-sm text-slate-400">
                    {TEXT.edgeNotFound}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {previewGraph.edges.map((edge, index) => (
                      <div key={`${edge.source}-${edge.target}-${index}`} className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {nodeNameMap.get(edge.source) || edge.source}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {nodeNameMap.get(edge.target) || edge.target}
                          </span>
                        </div>
                        {edge.condition ? (
                          <div className="mt-2 text-xs leading-5 text-slate-500">
                            {edge.condition}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
};
