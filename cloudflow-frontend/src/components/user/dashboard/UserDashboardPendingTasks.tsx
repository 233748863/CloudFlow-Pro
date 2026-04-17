import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui';
import { EmptyState, LoadingSpinner } from '@/components/common';

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
  <div className="card">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
      <h2 className="text-lg font-semibold text-slate-900">待办事项</h2>
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
          description="新的审批到达后，这里会自动更新。"
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <button
              key={String(task.taskId || task.id || task.processInstanceId)}
              type="button"
              onClick={onViewAll}
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
                  <ClipboardCheck size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {task.title || task.workflowName || '流程待办'}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {task.nodeName || task.currentNodeName || '待处理节点'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-400">
                  {task.createdTime || ''}
                </p>
                <p className="mt-1 text-xs text-amber-600">待处理</p>
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
  </div>
);
