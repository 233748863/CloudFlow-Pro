import React from 'react';
import { ArrowRight, CircleAlert, ListTodo } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '@/components/common';
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
  <section className="card overflow-hidden">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <ListTodo size={18} className="text-cyan-600 dark:text-cyan-300" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">统一待办</h2>
      </div>
    </div>
    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="当前没有跨模块待办" description="CRM 与 OA 的联动待办会汇总展示在这里。" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="cf-interactive-card group flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-slate-800 dark:bg-slate-900/70"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="badge badge-cyan">{item.sourceLabel || '联动待办'}</span>
                  {item.status ? <span className="text-xs text-slate-500 dark:text-slate-400">{getTodoStatusLabel(item.status)}</span> : null}
                </div>
                <p className="mt-2 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description || '待继续推进'}</p>
              </div>
              <ArrowRight size={14} className="ml-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
);
