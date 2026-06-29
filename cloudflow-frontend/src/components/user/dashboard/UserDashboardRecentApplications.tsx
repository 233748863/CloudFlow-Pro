import React from 'react';
import { ArrowRight, FileText } from 'lucide-react';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

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
  <InnerTableSurface className="dashboard-detail-card" wrapperClassName="flex h-full flex-col p-0">
    <div className="p-4 admin-source-section-head border-b border-slate-200 dark:border-slate-800">
      <div>
        <strong>最近申请</strong>
        <span>我最近发起的业务流程</span>
      </div>
      <span className="badge badge-gray">Top 5</span>
    </div>

    <div className="p-4">
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
        <div className="grid gap-3">
          {applications.map((item) => (
            <button
              key={String(item.id || item.processInstanceId || item.businessKey)}
              type="button"
              onClick={onViewAll}
              className="admin-dashboard-action-row group flex w-full items-center justify-between text-left"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="admin-source-stat-icon bg-[#effbfe] text-[#0d95b5] dark:bg-cyan-950/30 dark:text-cyan-200">
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
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#0d95b5] dark:text-cyan-200">
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
  </InnerTableSurface>
);
