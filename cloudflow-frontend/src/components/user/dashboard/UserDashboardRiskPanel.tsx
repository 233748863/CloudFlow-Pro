import React from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import { useDict } from '@/hooks/useDict';

export interface UserDashboardRiskItem {
  id: string;
  title: string;
  description?: string;
  level?: string;
  sourceLabel?: string;
  onClick: () => void;
}

interface UserDashboardRiskPanelProps {
  items: UserDashboardRiskItem[];
  loading: boolean;
}

export const UserDashboardRiskPanel: React.FC<UserDashboardRiskPanelProps> = ({
  items,
  loading,
}) => {
  const severityDict = useDict('severity_level');
  return (
    <InnerTableSurface className="dashboard-detail-card" wrapperClassName="flex h-full flex-col p-0">
      <div className="p-4 admin-source-section-head border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-rose-600 dark:text-rose-300" />
          <strong>统一风险</strong>
        </div>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="当前没有联动风险" description="预算阈值、发票异常、高风险客户会统一显示在这里。" />
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="admin-dashboard-action-row is-muted group flex w-full items-center justify-between text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{item.sourceLabel || '联动风险'}</span>
                    {item.level ? <span className="text-xs text-cf-subtle">{severityDict.getLabel(item.level) || '-'}</span> : null}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-cf-title">{item.title}</p>
                  <p className="mt-1 text-xs text-cf-subtle">{item.description || '需要尽快处理'}</p>
                </div>
                <ArrowRight size={14} className="ml-4 shrink-0 text-cf-faint transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}
      </div>
    </InnerTableSurface>
  );
};
