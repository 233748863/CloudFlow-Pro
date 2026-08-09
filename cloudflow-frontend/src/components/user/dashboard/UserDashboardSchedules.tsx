import React from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

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
  <InnerTableSurface className="dashboard-detail-card" wrapperClassName="flex h-full flex-col p-0">
    <div className="p-4 admin-source-section-head border-b border-slate-200 dark:border-slate-800">
      <div>
        <strong>今日日程</strong>
        <span>今天的会议、外出和个人安排</span>
      </div>
      <span className="badge badge-gray">Today</span>
    </div>

    <div className="p-4">
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
        <div className="grid gap-3">
          {schedules.map((item) => (
            <button
              key={String(item.eventId || item.id)}
              type="button"
              onClick={onViewAll}
              className="admin-dashboard-action-row is-muted group flex w-full items-center justify-between text-left"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="admin-source-stat-icon bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  <CalendarDays size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-cf-title">
                    {item.title || '日程安排'}
                  </p>
                  <p className="truncate text-xs text-cf-subtle">
                    {item.description || '查看详细日程安排'}
                  </p>
                </div>
              </div>
              <div className="ml-4 text-right">
                <p className="text-xs font-medium text-cf-faint">
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
  </InnerTableSurface>
);
