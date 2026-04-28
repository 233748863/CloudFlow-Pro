import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, FileClock, Loader2, RefreshCw, Timer } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { getTodaySchedule } from '@/services/api/schedule';
import { getUnreadCount } from '@/services/api/notice';
import type { SysScheduleEvent } from '@/types';

export const MobileDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todaySchedules, setTodaySchedules] = useState<SysScheduleEvent[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    const [schedulesResult, unreadResult] = await Promise.allSettled([
      getTodaySchedule(),
      getUnreadCount(),
    ]);

    setTodaySchedules(
      schedulesResult.status === 'fulfilled' && Array.isArray(schedulesResult.value)
        ? schedulesResult.value
        : [],
    );
    setUnreadMessages(
      unreadResult.status === 'fulfilled' && typeof unreadResult.value === 'number'
        ? unreadResult.value
        : 0,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    await fetchDashboardData();
    toast.success('刷新成功');
  };

  const { isRefreshing, pullDistance, isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  const quickActions = [
    { label: '休假', path: '/hr/leave/application', icon: FileClock },
    { label: '加班', path: '/hr/overtime/applications', icon: Timer },
    { label: '日程', path: '/schedule', icon: CalendarDays },
    { label: '公告', path: '/announcement', icon: Bell },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 animate-spin text-cyan-600" size={32} />
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full">
      {isPulling ? (
        <div
          className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center transition-all duration-200"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            opacity: Math.min(pullDistance / 80, 1),
          }}
        >
          <div className="rounded-full bg-white p-2 shadow-lg">
            {isRefreshing ? (
              <Loader2 className="animate-spin text-cyan-600" size={24} />
            ) : (
              <RefreshCw className="text-cyan-600" size={24} />
            )}
          </div>
        </div>
      ) : null}

      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">早安，{user?.name}</h1>
            <p className="text-sm text-slate-500">
              今天是 {format(new Date(), 'yyyy年M月d日', { locale: zhCN })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/announcement')}
            className="relative p-2"
            aria-label="公告"
          >
            <Bell className="text-slate-600" />
            {unreadMessages > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            ) : null}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              type="button"
              onClick={() => navigate(action.path)}
              className="flex min-h-[70px] flex-col items-center justify-center gap-2 rounded-lg bg-white text-slate-700 shadow-sm"
            >
              <action.icon size={22} className="text-cyan-600" />
              <span className="text-xs">{action.label}</span>
            </button>
          ))}
        </div>

        <div className="rounded-lg bg-cyan-600 p-4 text-white shadow-sm">
          <div className="text-sm text-cyan-50">今日日程</div>
          <div className="mt-1 text-3xl font-bold">{todaySchedules.length}</div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">今日日程</h2>
            <button
              type="button"
              onClick={() => navigate('/schedule')}
              className="text-xs text-cyan-600"
            >
              查看全部
            </button>
          </div>
          <div className="space-y-3">
            {todaySchedules.length ? (
              todaySchedules.map((event) => (
                <div key={event.eventId} className="rounded-lg border-l-4 border-cyan-500 bg-white p-3 shadow-sm">
                  <div className="truncate text-sm font-medium text-slate-800">{event.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{event.startTime}</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                今日暂无日程安排
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
