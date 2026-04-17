import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui';
import { EmptyState, LoadingSpinner } from '@/components/common';

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
  <div className="card">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
      <h2 className="text-lg font-semibold text-slate-900">今日日程</h2>
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
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <CalendarDays size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {item.title || '日程安排'}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.description || '查看详细日程安排'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-400">
                  {item.startTime || ''}
                </p>
                <p className="mt-1 text-xs text-amber-600">查看日程</p>
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
  </div>
);
