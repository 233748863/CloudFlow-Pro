import React from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

interface UserDashboardPendingTasksProps {
  tasks: any[];
  loading: boolean;
  onViewAll: () => void;
}

export const UserDashboardPendingTasks: React.FC<UserDashboardPendingTasksProps> = ({
  tasks,
  loading,
  onViewAll,
}) => (
  <InnerTableSurface className="dashboard-detail-card" wrapperClassName="flex h-full flex-col p-0">
    <div className="p-4 admin-source-section-head border-b border-slate-200 dark:border-slate-800">
      <div>
        <strong>待办事项</strong>
        <span>最近 5 条待处理任务</span>
      </div>
      <span className="badge badge-gray">Top 5</span>
    </div>

    <div className="p-4">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="empty-state-icon h-10 w-10" />}
          title="当前没有待办"
          description="新的审批任务到达后，这里会自动刷新。"
        />
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <button
              key={String(task.taskId || task.id || task.processInstanceId)}
              type="button"
              onClick={onViewAll}
              className="admin-dashboard-action-row group flex w-full items-center justify-between text-left"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="admin-source-stat-icon bg-[#effbfe] text-[#0d95b5] dark:bg-cyan-950/30 dark:text-cyan-200">
                  <ClipboardCheck size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {task.title || task.workflowName || '流程待办'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {task.nodeName || task.currentNodeName || '待处理节点'}
                  </p>
                </div>
              </div>

              <div className="ml-4 text-right">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {task.createdTime || ''}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#0d95b5] dark:text-cyan-200">
                  立即处理
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </button>
          ))}

          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={onViewAll}>
              查看全部待办
            </Button>
          </div>
        </div>
      )}
    </div>
  </InnerTableSurface>
);
