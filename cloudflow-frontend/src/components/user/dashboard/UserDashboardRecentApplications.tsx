import React from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui';
import { EmptyState, LoadingSpinner } from '@/components/common';

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
  <div className="card">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
      <h2 className="text-lg font-semibold text-slate-900">最近申请</h2>
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
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {item.title || item.processDefinitionName || '流程申请'}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.reason || item.currentNodeName || '查看当前流程状态'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-400">
                  {item.createdTime || ''}
                </p>
                <p className="mt-1 text-xs text-sky-600">查看详情</p>
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
  </div>
);
