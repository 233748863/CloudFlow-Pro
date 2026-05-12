import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Bell, CheckCircle2, Calendar, ChevronRight, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/common';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from 'sonner';
import { getWorkplaceSummary, getRecentTasks } from '@/services/api/workplace';
import { getTodaySchedule } from '@/services/api/schedule';
import { getUnreadCount } from '@/services/api/notice';
import { getTasksCount } from '@/services/api/workflow';
import type { WorkplaceSummary, RecentTask } from '@/services/api/workplace';
import type { SysScheduleEvent } from '@/types';

// 统计数据类型
interface DashboardStats {
  pendingTasks: number;
  todaySchedules: number;
  unreadMessages: number;
}

export const MobileDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // 数据状态
  const [stats, setStats] = useState<DashboardStats>({
    pendingTasks: 0,
    todaySchedules: 0,
    unreadMessages: 0,
  });
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<SysScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取仪表板数据
  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null);

      // 并行请求所有数据
      const [summaryData, tasksData, schedulesData, unreadData, taskCountData] = await Promise.allSettled([
        getWorkplaceSummary(),
        getRecentTasks(5),
        getTodaySchedule(),
        getUnreadCount(),
        getTasksCount(),
      ]);

      // 处理工作台概览
      if (summaryData.status === 'fulfilled' && summaryData.value) {
        const summary = summaryData.value;
        setStats(prev => ({
          ...prev,
          pendingTasks: summary.statistics?.pendingTasks ?? prev.pendingTasks,
          todaySchedules: summary.statistics?.todaySchedules ?? prev.todaySchedules,
          unreadMessages: summary.statistics?.unreadMessages ?? prev.unreadMessages,
        }));
      }

      // 处理最近任务
      if (tasksData.status === 'fulfilled' && Array.isArray(tasksData.value)) {
        setRecentTasks(tasksData.value);
      }

      // 处理今日日程
      if (schedulesData.status === 'fulfilled' && Array.isArray(schedulesData.value)) {
        setTodaySchedules(schedulesData.value);
      }

      // 处理未读消息数（优先使用独立接口的数据）
      if (unreadData.status === 'fulfilled' && typeof unreadData.value === 'number') {
        setStats(prev => ({
          ...prev,
          unreadMessages: unreadData.value as number,
        }));
      }

      // 处理任务统计（优先使用独立接口的数据）
      if (taskCountData.status === 'fulfilled' && taskCountData.value) {
        const counts = taskCountData.value;
        setStats(prev => ({
          ...prev,
          pendingTasks: counts.pending ?? prev.pendingTasks,
        }));
      }

      // 检查是否所有请求都失败了
      const allFailed = [summaryData, tasksData, schedulesData, unreadData, taskCountData]
        .every(r => r.status === 'rejected');
      if (allFailed) {
        setError('无法加载数据，请检查网络连接');
      }
    } catch (err: any) {
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // 下拉刷新
  const handleRefresh = async () => {
    await fetchDashboardData();
    toast.success('刷新成功');
  };

  const { isRefreshing, pullDistance, isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  const quickActions = [
    { label: '用车申请', path: '/vehicle/booking', color: 'bg-pink-50 text-pink-500' },
    { label: '请假', path: '/hr/attendance', color: 'bg-green-100 text-green-600' },
    { label: '报销', path: '/reimbursement/request', color: 'bg-orange-100 text-orange-600' },
    { label: '会议室', path: '/meeting-room', color: 'bg-purple-100 text-purple-600' },
  ];

  // 格式化时间显示
  const formatScheduleTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const period = hours < 12 ? 'AM' : 'PM';
      const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      return { time: `${displayHour}:${minutes}`, period };
    } catch {
      return { time: '--:--', period: '' };
    }
  };

  // 获取任务优先级样式
  const getPriorityStyle = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
      case '高':
        return 'text-red-500';
      case 'medium':
      case '中':
        return 'text-orange-500';
      default:
        return 'text-slate-400';
    }
  };

  // 获取任务状态标签
  const getStatusLabel = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return '待处理';
      case 'in_progress':
        return '进行中';
      case 'completed':
        return '已完成';
      default:
        return status || '待处理';
    }
  };

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="animate-spin text-pink-500 mx-auto mb-3" size={32} />
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Pull to Refresh Indicator */}
      {isPulling && (
        <div
          className="absolute top-0 left-0 right-0 flex justify-center items-center transition-all duration-200 z-10"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            opacity: Math.min(pullDistance / 80, 1),
          }}
        >
          <div className="bg-white rounded-full p-2 shadow-lg">
            {isRefreshing ? (
              <Loader2 className="animate-spin text-pink-500" size={24} />
            ) : (
              <RefreshCw
                className="text-pink-500 transition-transform"
                size={24}
                style={{
                  transform: `rotate(${Math.min((pullDistance / 80) * 360, 360)}deg)`,
                }}
              />
            )}
          </div>
        </div>
      )}

      <div className="p-4 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-600">{error}</span>
            <button
              onClick={() => {
                setLoading(true);
                fetchDashboardData();
              }}
              className="ml-auto text-xs text-red-600 underline"
            >
              重试
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900">早安, {user?.name}</h1>
            <p className="text-sm text-slate-500">
              今天是 {format(new Date(), 'yyyy年M月d日', { locale: zhCN })}
            </p>
          </div>
          <button
            onClick={() => navigate('/messages')}
            className="relative p-2"
            aria-label="消息通知"
          >
            <Bell className="text-slate-600" />
            {stats.unreadMessages > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-[10px] text-white font-bold">
                  {stats.unreadMessages > 99 ? '99+' : stats.unreadMessages}
                </span>
              </span>
            )}
          </button>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center space-y-2 min-h-[64px]"
              aria-label={action.label}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.color}`}>
                <span className="font-bold text-lg">{action.label[0]}</span>
              </div>
              <span className="text-xs text-slate-600">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Stats Card */}
        <Card className="bg-pink-500 text-white border-none shadow-pink-100 shadow-lg">
          <CardContent className="p-4 flex justify-between items-center">
            <button onClick={() => navigate('/tasks')} className="text-center flex-1">
              <div className="text-pink-50 text-sm">待办任务</div>
              <div className="text-3xl font-bold mt-1">{stats.pendingTasks}</div>
            </button>
            <div className="h-10 w-[1px] bg-pink-300"></div>
            <button onClick={() => navigate('/schedule')} className="text-center flex-1">
              <div className="text-pink-50 text-sm">今日日程</div>
              <div className="text-3xl font-bold mt-1">{stats.todaySchedules}</div>
            </button>
            <div className="h-10 w-[1px] bg-pink-300"></div>
            <button onClick={() => navigate('/messages')} className="text-center flex-1">
              <div className="text-pink-50 text-sm">消息</div>
              <div className="text-3xl font-bold mt-1">{stats.unreadMessages}</div>
            </button>
          </CardContent>
        </Card>

        {/* Todo List Preview */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-slate-800">待办事项</h2>
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-pink-500 flex items-center"
              aria-label="查看全部待办事项"
            >
              查看全部 <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {recentTasks.length > 0 ? (
              recentTasks.map((task) => (
                <div
                  key={task.taskId}
                  className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex items-start gap-3 active:bg-slate-50 transition-colors"
                  onClick={() => navigate(`/tasks/${task.taskId}`)}
                  role="button"
                  tabIndex={0}
                >
                  <CheckCircle2
                    size={18}
                    className={`mt-1 flex-shrink-0 ${getPriorityStyle(task.priority)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 text-sm truncate">
                      {task.taskName || '未命名任务'}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      {task.applicant && <span>申请人：{task.applicant}</span>}
                      {task.deadline && <span>· 截止：{task.deadline}</span>}
                    </div>
                    {task.processName && (
                      <span className="inline-block mt-1 text-[10px] bg-pink-50 text-pink-500 px-1.5 py-0.5 rounded">
                        {task.processName}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">
                    {getStatusLabel(task.status)}
                  </span>
                </div>
              ))
            ) : (
              <div className="bg-white p-6 rounded-lg border border-slate-100 text-center">
                <CheckCircle2 size={32} className="text-green-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">暂无待办事项</p>
                <p className="text-xs text-slate-400 mt-1">所有任务已处理完毕</p>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Preview */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-slate-800">今日日程</h2>
            <button
              onClick={() => navigate('/schedule')}
              className="text-xs text-pink-500 flex items-center"
              aria-label="查看全部日程"
            >
              查看全部 <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {todaySchedules.length > 0 ? (
              todaySchedules.map((event) => {
                const { time, period } = formatScheduleTime(event.startTime);
                return (
                  <div
                    key={event.eventId}
                    className="bg-pink-50 p-3 rounded-lg border-l-4 border-pink-400 flex items-start gap-3"
                  >
                    <div className="text-center min-w-[3rem]">
                      <div className="text-xs text-pink-500 font-bold">{time}</div>
                      <div className="text-xs text-pink-300">{period}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 text-sm truncate">
                        {event.title}
                      </div>
                      {event.roomId && (
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Calendar size={10} />
                          会议室 {event.roomId}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-slate-50 p-6 rounded-lg text-center">
                <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">今日暂无日程安排</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
