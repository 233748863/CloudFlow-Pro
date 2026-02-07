import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Calendar, Clock, MapPin, Users, Loader2, RefreshCw, Plus } from 'lucide-react';
import { getTodaySchedule, getMyEvents } from '@/services/api/schedule';
import type { SysScheduleEvent } from '@/types';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

type ViewType = 'day' | 'week';

export const MobileSchedule: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<SysScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<ViewType>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());

  // 获取日程列表
  const fetchSchedule = useCallback(async () => {
    try {
      let result: SysScheduleEvent[];
      
      if (viewType === 'day') {
        // 获取今日日程
        result = await getTodaySchedule();
      } else {
        // 获取本周日程
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
        result = await getMyEvents(
          format(weekStart, 'yyyy-MM-dd'),
          format(weekEnd, 'yyyy-MM-dd')
        );
      }
      
      setEvents(result);
    } catch (err: any) {
      toast.error(err.message || '加载日程失败');
    } finally {
      setLoading(false);
    }
  }, [viewType, selectedDate]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // 下拉刷新
  const handleRefresh = async () => {
    await fetchSchedule();
    toast.success('刷新成功');
  };

  const { isRefreshing, pullDistance, isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // 格式化时间
  const formatTime = (timeStr: string) => {
    try {
      const date = parseISO(timeStr);
      return format(date, 'HH:mm');
    } catch {
      return '--:--';
    }
  };

  // 获取事件类型样式
  const getEventTypeStyle = (type: string) => {
    switch (type) {
      case 'MEETING':
        return 'bg-indigo-100 text-indigo-600 border-indigo-200';
      case 'WORK':
        return 'bg-green-100 text-green-600 border-green-200';
      case 'PERSONAL':
        return 'bg-orange-100 text-orange-600 border-orange-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  // 获取事件类型标签
  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case 'MEETING':
        return '会议';
      case 'WORK':
        return '工作';
      case 'PERSONAL':
        return '个人';
      default:
        return '其他';
    }
  };

  // 按日期分组事件
  const groupEventsByDate = () => {
    const grouped: { [key: string]: SysScheduleEvent[] } = {};
    events.forEach(event => {
      try {
        const date = format(parseISO(event.startTime), 'yyyy-MM-dd');
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(event);
      } catch (e) {
        // 忽略无效日期
      }
    });
    return grouped;
  };

  // 获取本周日期列表
  const getWeekDays = () => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  };

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={32} />
          <p className="text-sm text-slate-500">加载日程...</p>
        </div>
      </div>
    );
  }

  const groupedEvents = groupEventsByDate();
  const weekDays = getWeekDays();

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {/* Pull to Refresh */}
      {isPulling && (
        <div
          className="absolute top-0 left-0 right-0 flex justify-center items-center transition-all duration-200 z-20"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            opacity: Math.min(pullDistance / 80, 1),
          }}
        >
          <div className="bg-white rounded-full p-2 shadow-lg">
            {isRefreshing ? (
              <Loader2 className="animate-spin text-indigo-600" size={24} />
            ) : (
              <RefreshCw
                className="text-indigo-600 transition-transform"
                size={24}
                style={{ transform: `rotate(${Math.min((pullDistance / 80) * 360, 360)}deg)` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1"
          aria-label="返回"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900 flex-1">我的日程</h1>
        <button
          onClick={() => navigate('/schedule/create')}
          className="p-2 text-indigo-600"
          aria-label="新建日程"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* View Toggle */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex gap-2">
        <button
          onClick={() => setViewType('day')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            viewType === 'day'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          今日
        </button>
        <button
          onClick={() => setViewType('week')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            viewType === 'week'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          本周
        </button>
      </div>

      {/* Week View - Date Selector */}
      {viewType === 'week' && (
        <div className="bg-white border-b border-slate-200 px-4 py-3">
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map(day => {
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDate);
              const dayEvents = groupedEvents[format(day, 'yyyy-MM-dd')] || [];
              
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={`flex flex-col items-center py-2 rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : isToday
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-slate-600'
                  }`}
                >
                  <span className="text-xs mb-1">{format(day, 'EEE', { locale: zhCN })}</span>
                  <span className="text-lg font-semibold">{format(day, 'd')}</span>
                  {dayEvents.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {dayEvents.slice(0, 3).map((_, i) => (
                        <div
                          key={i}
                          className={`w-1 h-1 rounded-full ${
                            isSelected ? 'bg-white' : 'bg-indigo-600'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Event List */}
      <div className="p-4 space-y-3">
        {viewType === 'day' ? (
          // 今日视图
          events.length > 0 ? (
            events.map(event => (
              <div
                key={event.eventId}
                className="bg-white rounded-lg p-4 shadow-sm border border-slate-100"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 text-center min-w-[60px]">
                    <div className="text-sm font-semibold text-indigo-600">
                      {formatTime(event.startTime)}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatTime(event.endTime)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-medium text-slate-900 line-clamp-2">
                        {event.title}
                      </h3>
                      <span
                        className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${getEventTypeStyle(
                          event.type
                        )}`}
                      >
                        {getEventTypeLabel(event.type)}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                        {event.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                      {event.roomId && (
                        <div className="flex items-center gap-1">
                          <MapPin size={12} />
                          <span>会议室 {event.roomId}</span>
                        </div>
                      )}
                      {event.attendees && (
                        <div className="flex items-center gap-1">
                          <Users size={12} />
                          <span>{JSON.parse(event.attendees).length} 人参加</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-lg p-12 text-center">
              <Calendar size={48} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">今日暂无日程安排</p>
              <button
                onClick={() => navigate('/schedule/create')}
                className="mt-4 text-sm text-indigo-600 underline"
              >
                创建新日程
              </button>
            </div>
          )
        ) : (
          // 本周视图 - 显示选中日期的事件
          (() => {
            const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
            const selectedEvents = groupedEvents[selectedDateStr] || [];
            
            return selectedEvents.length > 0 ? (
              <>
                <div className="text-sm font-medium text-slate-600 mb-3">
                  {format(selectedDate, 'yyyy年M月d日 EEEE', { locale: zhCN })}
                </div>
                {selectedEvents.map(event => (
                  <div
                    key={event.eventId}
                    className="bg-white rounded-lg p-4 shadow-sm border border-slate-100"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 text-center min-w-[60px]">
                        <div className="text-sm font-semibold text-indigo-600">
                          {formatTime(event.startTime)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatTime(event.endTime)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-medium text-slate-900 line-clamp-2">
                            {event.title}
                          </h3>
                          <span
                            className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${getEventTypeStyle(
                              event.type
                            )}`}
                          >
                            {getEventTypeLabel(event.type)}
                          </span>
                        </div>
                        {event.description && (
                          <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                            {event.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                          {event.roomId && (
                            <div className="flex items-center gap-1">
                              <MapPin size={12} />
                              <span>会议室 {event.roomId}</span>
                            </div>
                          )}
                          {event.attendees && (
                            <div className="flex items-center gap-1">
                              <Users size={12} />
                              <span>{JSON.parse(event.attendees).length} 人参加</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="bg-white rounded-lg p-12 text-center">
                <Calendar size={48} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">
                  {format(selectedDate, 'M月d日', { locale: zhCN })} 暂无日程安排
                </p>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};
