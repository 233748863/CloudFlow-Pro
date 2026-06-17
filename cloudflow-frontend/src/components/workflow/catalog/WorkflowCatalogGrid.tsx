import React from 'react';
import { ArrowRight } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '@/components/common';
import type { WorkflowDefinition } from '@/types';
import { getWorkflowCategoryLabel } from '@/utils/workflowCategory';
import { getWorkflowCatalogIcon, normalizeWorkflowTags } from './workflowCatalogUtils';

interface WorkflowCatalogGridProps {
  workflows: WorkflowDefinition[];
  loading: boolean;
  onStart: (workflow: WorkflowDefinition) => void;
}

export const WorkflowCatalogGrid: React.FC<WorkflowCatalogGridProps> = ({
  workflows,
  loading,
  onStart,
}) => (
  <section className="card overflow-hidden">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">可发起流程</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          统一展示分类、标签、版本与发起入口。
        </p>
      </div>
      <span className="badge badge-gray">共 {workflows.length} 条</span>
    </div>

    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          title="没有匹配的流程"
          description="可以调整搜索词、分类或标签条件后重新查看。"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => {
            const workflowTags = normalizeWorkflowTags(workflow.tags);
            const categoryLabel =
              getWorkflowCategoryLabel(workflow.category) || workflow.category || '未分类';

            return (
              <button
                key={workflow.id}
                type="button"
                onClick={() => onStart(workflow)}
                className="cf-interactive-card group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-800 dark:bg-slate-950/88"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-primary">{categoryLabel}</span>
                  <span className={`badge ${workflow.formId ? 'badge-success' : 'badge-warning'}`}>
                    {workflow.formId ? '已绑表单' : '未绑表单'}
                  </span>
                </div>

                <div className="mt-4 flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">
                    {getWorkflowCatalogIcon(workflow)}
                  </div>
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                    v{workflow.version || 1}
                  </span>
                </div>

                <div className="mt-4 text-base font-semibold tracking-tight text-slate-900 transition-colors group-hover:text-cyan-600 dark:text-slate-100 dark:group-hover:text-cyan-200">
                  {workflow.name}
                </div>
                <div className="mt-2 line-clamp-2 min-h-[42px] text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {workflow.description || '当前流程暂未补充说明，可直接发起或联系管理员完善流程描述。'}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {workflowTags.length > 0 ? (
                    workflowTags.slice(0, 3).map((tag) => (
                      <span key={tag} className="badge badge-gray">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="badge badge-gray">暂无标签</span>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-slate-400 dark:text-slate-500">
                      Key: {workflow.key}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {workflow.formId ? '支持直接拉起表单' : '尚未配置发起表单'}
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">
                    发起
                    <ArrowRight size={14} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  </section>
);
