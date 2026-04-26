import React from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';

interface UserDashboardSchedulesProps {
  schedules: any[];
  loading: boolean;
  onViewAll: () => void;
}

export const UserDashboardSchedules: React.FC<UserDashboardSchedulesProps> = ({
  schedules,
  loading,
  onViewAll,
}) => (
  <section className="card overflow-hidden">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">今日日程</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">今天的会议、外出和个人安排</p>
      </div>
      <span className="badge badge-gray">Today</span>
    </div>

    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="empty-state-icon h-10 w-10" />}
          title="今天没有日程"
          description="创建新的会议或个人安排后，这里会显示今日摘要。"
        />
      ) : (
        <div className="space-y-3">
          {schedules.map((item) => (
            <button
              key={String(item.eventId || item.id)}
              type="button"
              onClick={onViewAll}
              className="group flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition-all hover:border-amber-200 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-amber-900 dark:hover:bg-slate-900"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  <CalendarDays size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.title || '日程安排'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {item.description || '查看详细日程安排'}
                  </p>
                </div>
              </div>
              <div className="ml-4 text-right">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {item.startTime || ''}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-200">
                  查看日程
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </button>
          ))}
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={onViewAll}>
              查看全部日程
            </Button>
          </div>
        </div>
      )}
    </div>
  </section>
);
