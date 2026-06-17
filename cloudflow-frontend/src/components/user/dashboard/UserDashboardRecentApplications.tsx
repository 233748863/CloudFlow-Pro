import React from 'react';
import { ArrowRight, FileText } from 'lucide-react';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';

interface UserDashboardRecentApplicationsProps {
  applications: any[];
  loading: boolean;
  onViewAll: () => void;
}

export const UserDashboardRecentApplications: React.FC<UserDashboardRecentApplicationsProps> = ({
  applications,
  loading,
  onViewAll,
}) => (
  <section className="card overflow-hidden">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">最近申请</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">我最近发起的业务流程</p>
      </div>
      <span className="badge badge-gray">Top 5</span>
    </div>

    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={<FileText className="empty-state-icon h-10 w-10" />}
          title="还没有申请记录"
          description="从快捷入口进入即可发起新的业务流程。"
        />
      ) : (
        <div className="space-y-3">
          {applications.map((item) => (
            <button
              key={String(item.id || item.processInstanceId || item.businessKey)}
              type="button"
              onClick={onViewAll}
              className="cf-interactive-card group flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left dark:border-slate-800 dark:bg-slate-900/70"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.title || item.processDefinitionName || '流程申请'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {item.reason || item.currentNodeName || '查看当前流程状态'}
                  </p>
                </div>
              </div>
              <div className="ml-4 text-right">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {item.createdTime || ''}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-200">
                  查看详情
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </button>
          ))}
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={onViewAll}>
              查看全部申请
            </Button>
          </div>
        </div>
      )}
    </div>
  </section>
);
