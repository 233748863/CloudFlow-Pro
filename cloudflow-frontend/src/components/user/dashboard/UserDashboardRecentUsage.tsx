import React from 'react';
import { ArrowRight } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '@/components/common';

export interface UserDashboardRecentUsageItem {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  typeLabel: string;
  icon: React.ReactNode;
  toneClassName: string;
  onClick: () => void;
}

interface UserDashboardRecentUsageProps {
  items: UserDashboardRecentUsageItem[];
  loading: boolean;
  rangeLabel: string;
}

export const UserDashboardRecentUsage: React.FC<UserDashboardRecentUsageProps> = ({
  items,
  loading,
  rangeLabel,
}) => (
  <section className="card overflow-hidden">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        最近活动
      </h2>
      <span className="badge badge-gray">{rangeLabel}</span>
    </div>

    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="当前时间范围没有活动"
          description="可以调整日期范围，或者前往工作台发起新的流程。"
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="cf-interactive-card group flex w-full items-center justify-between rounded-xl border border-slate-100/50 bg-white/40 p-4 text-left shadow-[0_2px_8px_-2px_rgba(15,23,42,0.01)] dark:border-slate-800/30 dark:bg-slate-950/20"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.toneClassName}`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {item.timeLabel} · {item.description}
                  </p>
                </div>
              </div>

              <div className="ml-4 flex shrink-0 flex-col items-end">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {item.typeLabel}
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-cyan-600 transition-colors group-hover:text-cyan-700 dark:text-cyan-300 dark:group-hover:text-cyan-200">
                  打开页面
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
);
