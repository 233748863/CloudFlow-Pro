import React from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Button, EmptyState, LoadingSpinner } from '@/components/ui';

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
  <section className="card overflow-hidden">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">待办事项</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">最近 5 条待处理任务</p>
      </div>
      <span className="badge badge-gray">Top 5</span>
    </div>

    <div className="p-6">
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
        <div className="space-y-3">
          {tasks.map((task) => (
            <button
              key={String(task.taskId || task.id || task.processInstanceId)}
              type="button"
              onClick={onViewAll}
              className="group flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition-all hover:border-cyan-200 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-cyan-900 dark:hover:bg-slate-900"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">
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
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-cyan-700 dark:text-cyan-200">
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
  </section>
);
