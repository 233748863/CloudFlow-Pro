import React from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '@/components/common';
import { getSeverityLabel } from '@/utils/enumLabels';

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
}) => (
  <section className="card overflow-hidden">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} className="text-rose-600 dark:text-rose-300" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">统一风险</h2>
      </div>
    </div>
    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="当前没有联动风险" description="预算阈值、发票异常、高风险客户会统一显示在这里。" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="group flex w-full items-center justify-between rounded-xl bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100 dark:bg-slate-900/70 dark:hover:bg-slate-900"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="badge badge-rose">{item.sourceLabel || '联动风险'}</span>
                  {item.level ? <span className="text-xs text-slate-500 dark:text-slate-400">{getSeverityLabel(item.level)}</span> : null}
                </div>
                <p className="mt-2 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description || '需要尽快处理'}</p>
              </div>
              <ArrowRight size={14} className="ml-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
);
