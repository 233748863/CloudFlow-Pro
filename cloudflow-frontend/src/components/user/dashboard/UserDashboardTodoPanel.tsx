import React from 'react';
import { ArrowRight, ListTodo } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import { getTodoStatusLabel } from '@/utils/enumLabels';

export interface UserDashboardTodoItem {
  id: string;
  title: string;
  description?: string;
  status?: string;
  sourceLabel?: string;
  onClick: () => void;
}

interface UserDashboardTodoPanelProps {
  items: UserDashboardTodoItem[];
  loading: boolean;
}

export const UserDashboardTodoPanel: React.FC<UserDashboardTodoPanelProps> = ({
  items,
  loading,
}) => (
  <InnerTableSurface className="dashboard-detail-card" wrapperClassName="flex h-full flex-col p-0">
    <div className="p-4 admin-source-section-head border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <ListTodo size={18} className="text-[#0d95b5] dark:text-cyan-200" />
        <strong>统一待办</strong>
      </div>
    </div>
    <div className="p-4">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="当前没有跨模块待办" description="CRM 与 OA 的联动待办会汇总展示在这里。" />
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
                  <span className="badge badge-primary">{item.sourceLabel || '联动待办'}</span>
                  {item.status ? <span className="text-xs text-cf-subtle">{getTodoStatusLabel(item.status)}</span> : null}
                </div>
                <p className="mt-2 truncate text-sm font-medium text-cf-title">{item.title}</p>
                <p className="mt-1 text-xs text-cf-subtle">{item.description || '待继续推进'}</p>
              </div>
              <ArrowRight size={14} className="ml-4 shrink-0 text-cf-faint transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  </InnerTableSurface>
);
