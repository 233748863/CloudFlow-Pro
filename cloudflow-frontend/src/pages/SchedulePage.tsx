import React, { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core';
import { Calendar, ChevronLeft, ChevronRight, CircleDot, Clock3, FileText, MapPin, Plus, Sparkles, SunMedium, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, DatePicker, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { useAuth } from '../context/AuthContext';
import { createEvent, deleteEvent, getMeetingRooms, getMyEvents } from '../services/api/schedule';
import type { MeetingRoom, SysScheduleEvent } from '../types';
import { parseBackendDate, toBackendDateString, toLocalDatetimeString, toQueryDateString } from '../utils/dateFormat';
import { WorkspaceBackdrop, WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import { WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';

type ScheduleEventType = SysScheduleEvent['type'];
type CalendarViewMode = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

interface CalendarEventExtendedProps {
  originalTitle: string;
  description?: string;
  type: ScheduleEventType;
  roomId?: string;
  roomName?: string | null;
  startTime: string;
  endTime: string;
}

interface ScheduleCalendarEvent extends EventInput {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  backgroundColor: string;
  borderColor: string;
  classNames: string[];
  extendedProps: CalendarEventExtendedProps;
}

interface SelectedEventDetail extends CalendarEventExtendedProps {
  id: string;
  title: string;
  allDay: boolean;
}

const EVENT_TYPE_META: Record<ScheduleEventType, { label: string; color: string; badgeClass: string; softClass: string; hint: string }> = {
  MEETING: {
    label: '会议',
    color: '#ec4899',
    badgeClass: 'bg-pink-500/10 text-pink-700 ring-1 ring-pink-200',
    softClass: 'bg-pink-50 text-pink-700',
    hint: '适合评审、同步和客户沟通',
  },
  WORK: {
    label: '工作',
    color: '#10b981',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200',
    softClass: 'bg-emerald-50 text-emerald-700',
    hint: '适合项目推进、交付和专注任务',
  },
  PERSONAL: {
    label: '个人',
    color: '#f59e0b',
    badgeClass: 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-200',
    softClass: 'bg-amber-50 text-amber-700',
    hint: '适合个人安排、提醒和生活事项',
  },
};

const VIEW_OPTIONS: Array<{ value: CalendarViewMode; label: string }> = [
  { value: 'dayGridMonth', label: '月' },
  { value: 'timeGridWeek', label: '周' },
  { value: 'timeGridDay', label: '日' },
];

const monthDayFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' });
const yearMonthFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
const dateOnlyFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
const longDateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
const timeFormatter = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

const createDefaultForm = (range?: { start: Date; end: Date; allDay?: boolean } | null): Partial<SysScheduleEvent> => {
  const start = range?.start ?? new Date();
  const end = range?.end ?? new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    type: 'PERSONAL',
    isAllDay: Boolean(range?.allDay),
    startTime: toBackendDateString(start),
    endTime: toBackendDateString(end),
  };
};

const getSafeDate = (value: string) => {
  const date = parseBackendDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getInclusiveEnd = (date: Date) => new Date(date.getTime() - 1000);

const formatViewWindow = (start: Date, end: Date, view: CalendarViewMode) => {
  const inclusiveEnd = getInclusiveEnd(end);
  if (view === 'timeGridDay') {
    return `${longDateFormatter.format(start)} · 单日聚焦`;
  }
  return `${monthDayFormatter.format(start)} - ${monthDayFormatter.format(inclusiveEnd)}`;
};

const getViewDisplayContent = (start: Date, end: Date, view: CalendarViewMode) => {
  const inclusiveEnd = getInclusiveEnd(end);
  switch (view) {
    case 'dayGridMonth':
      return {
        title: yearMonthFormatter.format(start),
        subtitle: '月视图 · 当月安排',
      };
    case 'timeGridWeek':
      return {
        title: `${monthDayFormatter.format(start)} - ${monthDayFormatter.format(inclusiveEnd)}`,
        subtitle: '周视图 · 7天安排',
      };
    case 'timeGridDay':
      return {
        title: dateOnlyFormatter.format(start),
        subtitle: '单日聚焦 · 细看当天安排',
      };
    default:
      return {
        title: formatViewWindow(start, end, view),
        subtitle: '日历视图',
      };
  }
};

const formatDateRange = (startValue: string, endValue: string, isAllDay: boolean) => {
  const start = getSafeDate(startValue);
  const end = getSafeDate(endValue);
  if (!start || !end) return '时间信息不可用';
  if (isAllDay) return `${longDateFormatter.format(start)} · 全天`;
  if (start.toDateString() === end.toDateString()) {
    return `${longDateFormatter.format(start)} ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
  }
  return `${monthDayFormatter.format(start)} ${timeFormatter.format(start)} - ${monthDayFormatter.format(end)} ${timeFormatter.format(end)}`;
};

const formatDateRangeFromDates = (start: Date, end: Date, isAllDay: boolean) => {
  if (isAllDay) return `${longDateFormatter.format(start)} · 全天`;
  if (start.toDateString() === end.toDateString()) {
    return `${longDateFormatter.format(start)} ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
  }
  return `${monthDayFormatter.format(start)} ${timeFormatter.format(start)} - ${monthDayFormatter.format(end)} ${timeFormatter.format(end)}`;
};

const formatEventSlot = (event: ScheduleCalendarEvent | SelectedEventDetail) => {
  if (event.allDay) return '全天安排';
  const startTime = 'extendedProps' in event ? event.extendedProps.startTime : event.startTime;
  const endTime = 'extendedProps' in event ? event.extendedProps.endTime : event.endTime;
  return formatDateRange(startTime, endTime, event.allDay);
};

const getDurationLabel = (startValue: string, endValue: string, isAllDay: boolean) => {
  if (isAllDay) return '全天';
  const start = getSafeDate(startValue);
  const end = getSafeDate(endValue);
  if (!start || !end) return '时长未知';
  const diffMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}小时${minutes}分钟`;
  if (hours > 0) return `${hours}小时`;
  return `${minutes}分钟`;
};

const isEventOnDay = (event: ScheduleCalendarEvent, date: Date) => {
  const start = getSafeDate(event.extendedProps.startTime);
  const end = getSafeDate(event.extendedProps.endTime);
  if (!start || !end) return false;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  return start < nextDay && end > dayStart;
};

const sortEventsByStart = <T extends { extendedProps: { startTime: string } }>(list: T[]) =>
  [...list].sort((left, right) => {
    const leftTime = getSafeDate(left.extendedProps.startTime)?.getTime() ?? 0;
    const rightTime = getSafeDate(right.extendedProps.startTime)?.getTime() ?? 0;
    return leftTime - rightTime;
  });

const SectionHeader = ({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
      <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{title}</div>
    </div>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition hover:text-pink-600"
      >
        {actionLabel}
        <ChevronRight size={14} />
      </button>
    ) : null}
  </div>
);

export const SchedulePage = () => {
  const { user } = useAuth();
  const calendarRef = useRef<FullCalendar | null>(null);
  const currentViewRange = useRef<{ start: Date; end: Date } | null>(null);

  const [events, setEvents] = useState<ScheduleCalendarEvent[]>([]);
  const [meetingRooms, setMeetingRooms] = useState<MeetingRoom[]>([]);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('dayGridMonth');
  const [calendarTitle, setCalendarTitle] = useState('');
  const [calendarWindowLabel, setCalendarWindowLabel] = useState('');
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<SelectedEventDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [form, setForm] = useState<Partial<SysScheduleEvent>>(createDefaultForm());

  const getRoomName = (roomId?: string, rooms: MeetingRoom[] = meetingRooms) => {
    if (!roomId) return null;
    const room = rooms.find(item => String(item.roomId) === String(roomId));
    return room?.name || `会议室 ${roomId}`;
  };

  const fetchEvents = async (start: Date, end: Date, rooms: MeetingRoom[] = meetingRooms) => {
    setIsLoadingEvents(true);
    setLoadError(null);
    try {
      const response = await getMyEvents(toQueryDateString(start), toQueryDateString(end));
      const eventList = Array.isArray(response) ? response : [];
      const mappedEvents: ScheduleCalendarEvent[] = eventList.map(item => {
        const typeMeta = EVENT_TYPE_META[item.type];
        const roomName = getRoomName(item.roomId, rooms);
        return {
          id: String(item.eventId),
          title: item.title,
          start: item.startTime,
          end: item.endTime,
          allDay: item.isAllDay,
          backgroundColor: typeMeta.color,
          borderColor: typeMeta.color,
          classNames: ['cf-event', `cf-event--${item.type.toLowerCase()}`],
          extendedProps: {
            originalTitle: item.title,
            description: item.description,
            type: item.type,
            roomId: item.roomId,
            roomName,
            startTime: item.startTime,
            endTime: item.endTime,
          },
        };
      });
      setEvents(mappedEvents);
    } catch (error) {
      console.error('加载日程失败', error);
      setLoadError('当前日程加载失败，请稍后重试');
      toast.error('加载日程失败，请稍后重试');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadRooms = async () => {
      try {
        const rooms = await getMeetingRooms();
        if (!active) return;
        const safeRooms = Array.isArray(rooms) ? rooms : [];
        setMeetingRooms(safeRooms);
        if (currentViewRange.current) {
          void fetchEvents(currentViewRange.current.start, currentViewRange.current.end, safeRooms);
        }
      } catch (error) {
        console.error('加载会议室失败', error);
      }
    };
    void loadRooms();
    return () => {
      active = false;
    };
  }, []);

  const openCreateDrawer = (range?: { start: Date; end: Date; allDay?: boolean } | null) => {
    setSelectedEvent(null);
    setSelectedDate(range ? { start: range.start, end: range.end, allDay: Boolean(range.allDay) } : null);
    setForm(createDefaultForm(range));
    setIsCreateDrawerOpen(true);
  };

  const closeCreateDrawer = () => {
    setIsCreateDrawerOpen(false);
    setSelectedDate(null);
  };

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    openCreateDrawer({
      start: selectInfo.start,
      end: selectInfo.end,
      allDay: selectInfo.allDay,
    });
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    setIsCreateDrawerOpen(false);
    setSelectedEvent({
      id: String(clickInfo.event.id),
      title: clickInfo.event.extendedProps.originalTitle || clickInfo.event.title,
      description: clickInfo.event.extendedProps.description,
      type: clickInfo.event.extendedProps.type,
      roomId: clickInfo.event.extendedProps.roomId,
      roomName: clickInfo.event.extendedProps.roomName,
      startTime: clickInfo.event.extendedProps.startTime,
      endTime: clickInfo.event.extendedProps.endTime,
      allDay: clickInfo.event.allDay,
      originalTitle: clickInfo.event.extendedProps.originalTitle || clickInfo.event.title,
    });
  };

  const handleDatesSet = (dateInfo: DatesSetArg) => {
    const viewType = dateInfo.view.type as CalendarViewMode;
    currentViewRange.current = { start: dateInfo.start, end: dateInfo.end };
    setCalendarViewMode(viewType);
    const focusStart = dateInfo.view.currentStart;
    const focusEnd = dateInfo.view.currentEnd;
    const displayContent = getViewDisplayContent(focusStart, focusEnd, viewType);
    setCalendarTitle(displayContent.title);
    setCalendarWindowLabel(displayContent.subtitle);
    void fetchEvents(dateInfo.start, dateInfo.end);
  };

  const handleSubmit = async () => {
    if (!form.title?.trim()) {
      toast.error('请输入日程主题');
      return;
    }
    if (!form.startTime || !form.endTime) {
      toast.error('请填写完整的时间信息');
      return;
    }

    const start = getSafeDate(form.startTime);
    const end = getSafeDate(form.endTime);
    if (!start || !end) {
      toast.error('时间格式无效，请重新选择');
      return;
    }
    if (end.getTime() <= start.getTime()) {
      toast.error('结束时间必须晚于开始时间');
      return;
    }

    setIsSubmitting(true);
    try {
      await createEvent({
        ...form,
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
      });
      toast.success('日程创建成功');
      closeCreateDrawer();
      if (currentViewRange.current) {
        await fetchEvents(currentViewRange.current.start, currentViewRange.current.end);
      }
    } catch (error) {
      console.error('创建日程失败', error);
      toast.error('创建失败，可能与已有安排发生时间冲突');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSelectedEvent = async () => {
    if (!selectedEvent) return;
    setIsDeleting(true);
    try {
      await deleteEvent(selectedEvent.id);
      toast.success('日程已删除');
      setSelectedEvent(null);
      if (currentViewRange.current) {
        await fetchEvents(currentViewRange.current.start, currentViewRange.current.end);
      }
    } catch (error) {
      console.error('删除日程失败', error);
      toast.error('删除失败，请稍后重试');
    } finally {
      setIsDeleting(false);
    }
  };

  const goToPrev = () => calendarRef.current?.getApi().prev();
  const goToNext = () => calendarRef.current?.getApi().next();
  const goToToday = () => calendarRef.current?.getApi().today();
  const changeView = (view: CalendarViewMode) => calendarRef.current?.getApi().changeView(view);

  if (!user) return null;

  const now = new Date();
  const todayEvents = sortEventsByStart(events.filter(event => isEventOnDay(event, now)));
  const upcomingEvents = sortEventsByStart(
    events.filter(event => {
      const end = getSafeDate(event.extendedProps.endTime);
      return end ? end.getTime() >= now.getTime() : false;
    }),
  ).slice(0, 5);

  const metrics = [
    {
      label: '当前视图日程',
      value: events.length,
      hint: '当前日历窗口内的全部安排',
      icon: Calendar,
      softClass: 'bg-pink-50 text-pink-600',
    },
    {
      label: '今日日程',
      value: todayEvents.length,
      hint: todayEvents.length > 0 ? `最早一项在 ${todayEvents[0].allDay ? '全天' : timeFormatter.format(getSafeDate(todayEvents[0].extendedProps.startTime) ?? now)}` : '今天暂无安排',
      icon: SunMedium,
      softClass: 'bg-amber-50 text-amber-600',
    },
    {
      label: '会议占比',
      value: events.filter(event => event.extendedProps.type === 'MEETING').length,
      hint: '保留会议类安排的快速识别',
      icon: Sparkles,
      softClass: 'bg-pink-50 text-pink-600',
    },
    {
      label: '全天事项',
      value: events.filter(event => event.allDay).length,
      hint: '长期占用时间块的提醒',
      icon: Clock3,
      softClass: 'bg-emerald-50 text-emerald-600',
    },
  ];

  const primaryTodayEvent = todayEvents[0];
  const selectionSummary = selectedDate
    ? formatDateRangeFromDates(
        selectedDate.start,
        selectedDate.allDay ? getInclusiveEnd(selectedDate.end) : selectedDate.end,
        selectedDate.allDay,
      )
    : '填写主题、时间与备注，快速完成你的新安排。';

  const todayLabel = shortDateFormatter.format(now);
  const timeLabel = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const currentViewLabel = calendarViewMode === 'dayGridMonth' ? '月视图' : calendarViewMode === 'timeGridWeek' ? '周视图' : '日视图';
  const scheduleSummary = primaryTodayEvent
    ? `今天共有 ${todayEvents.length} 项安排，最近一项是“${primaryTodayEvent.title}”。`
    : '今天暂时没有新的日程安排，可以提前规划接下来的工作与个人事项。';
  const calendarWorkspaceDescription = loadError ? loadError : calendarWindowLabel || '把时间安排放到同一块画布里统一查看';
  const focusItems = [
    {
      label: '当前视图',
      value: calendarTitle || '日历',
      hint: calendarWindowLabel || '同步当前时间窗口',
      tone: 'bg-pink-50 text-pink-600',
      onClick: () => {},
    },
    primaryTodayEvent
      ? {
          label: '今日日程',
          value: primaryTodayEvent.allDay ? '全天' : timeFormatter.format(getSafeDate(primaryTodayEvent.extendedProps.startTime) ?? now),
          hint: primaryTodayEvent.title,
          tone: 'bg-amber-50 text-amber-600',
          onClick: () =>
            setSelectedEvent({
              id: primaryTodayEvent.id,
              title: primaryTodayEvent.extendedProps.originalTitle,
              description: primaryTodayEvent.extendedProps.description,
              type: primaryTodayEvent.extendedProps.type,
              roomId: primaryTodayEvent.extendedProps.roomId,
              roomName: primaryTodayEvent.extendedProps.roomName,
              startTime: primaryTodayEvent.extendedProps.startTime,
              endTime: primaryTodayEvent.extendedProps.endTime,
              allDay: primaryTodayEvent.allDay,
              originalTitle: primaryTodayEvent.extendedProps.originalTitle,
            }),
        }
      : null,
    upcomingEvents[0]
      ? {
          label: '即将开始',
          value: upcomingEvents[0].allDay ? '全天' : timeFormatter.format(getSafeDate(upcomingEvents[0].extendedProps.startTime) ?? now),
          hint: upcomingEvents[0].extendedProps.originalTitle,
          tone: 'bg-rose-50 text-rose-600',
          onClick: () =>
            setSelectedEvent({
              id: upcomingEvents[0].id,
              title: upcomingEvents[0].extendedProps.originalTitle,
              description: upcomingEvents[0].extendedProps.description,
              type: upcomingEvents[0].extendedProps.type,
              roomId: upcomingEvents[0].extendedProps.roomId,
              roomName: upcomingEvents[0].extendedProps.roomName,
              startTime: upcomingEvents[0].extendedProps.startTime,
              endTime: upcomingEvents[0].extendedProps.endTime,
              allDay: upcomingEvents[0].allDay,
              originalTitle: upcomingEvents[0].extendedProps.originalTitle,
            }),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; hint: string; tone: string; onClick: () => void }>;

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-6 p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <WorkspaceHeroCard
            badge={(
              <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-pink-600 ring-1 ring-pink-100">
                  <Calendar size={14} />
                  {todayLabel}
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{timeLabel}</span>
                <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{currentViewLabel}</span>
              </div>
            )}
            title="我的日程"
            description={scheduleSummary}
            actions={(
              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="h-12 rounded-2xl bg-pink-500 px-6 text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)] hover:bg-pink-600" onClick={() => openCreateDrawer()}>
                  <Plus size={18} className="mr-2" />
                  新建日程
                </Button>
                <Button variant="outline" size="lg" className="h-12 rounded-2xl bg-white/85 px-6" onClick={goToToday}>
                  <Calendar size={18} className="mr-2 text-pink-500" />
                  回到今天
                </Button>
              </div>
            )}
            contentClassName="p-7 sm:p-8"
            glowClassName="bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.18),transparent_52%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.16),transparent_42%)]"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/78 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <Sparkles size={14} />
              日程工作台
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">当前视图</div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{calendarTitle || '日历'}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{calendarWindowLabel || '同步当前时间窗口'}</div>
              </div>
              <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">今日日程</div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{todayEvents.length}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">今天在日历中的事项数量</div>
              </div>
              <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">即将开始</div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{upcomingEvents.length}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">当前视图内接下来需要关注的安排</div>
              </div>
            </div>
          </WorkspaceHeroCard>

          <WorkspaceSectionCard
            eyebrow="今日焦点"
            title="今天先看这些"
            headerAside={(
              <div className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                {currentViewLabel}
              </div>
            )}
            className="rounded-[34px]"
            bodyClassName="space-y-5"
          >
            <div className="space-y-3">
              {focusItems.length > 0 ? (
                focusItems.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.onClick}
                    className="flex w-full items-start gap-3 rounded-[24px] border border-slate-100 bg-white px-4 py-4 text-left transition hover:border-pink-100 hover:bg-pink-50/30"
                  >
                    <div className={`rounded-2xl p-3 ${item.tone}`}>
                      <CircleDot size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                        <div className="text-xs font-semibold text-slate-400">{item.value}</div>
                      </div>
                      <div className="mt-1 truncate text-xs leading-5 text-slate-500">{item.hint}</div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
                  <div className="text-sm font-semibold text-slate-700">今天节奏平稳</div>
                  <div className="mt-2 text-xs leading-6 text-slate-400">当前没有高优先级日程提醒，你可以提前规划接下来的安排。</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">会议占比</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{events.filter(event => event.extendedProps.type === 'MEETING').length}</div>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">全天事项</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{events.filter(event => event.allDay).length}</div>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">当前窗口</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{events.length}</div>
              </div>
            </div>
          </WorkspaceSectionCard>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => {
            const Icon = metric.icon;
            return (
              <WorkspaceMetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                hint={metric.hint}
                aside={<div className={`rounded-2xl p-3 ${metric.softClass}`}><Icon size={18} /></div>}
                toneClassName="border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,250,252,0.8))] shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
                className="rounded-[28px] px-5 py-5"
              />
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <WorkspaceSectionCard
            eyebrow="日历工作区"
            title="日历画布"
            description={calendarWorkspaceDescription}
            headerAside={(
              <div className="flex w-full flex-wrap items-center justify-start gap-3 lg:justify-end">
                <div className="inline-flex h-11 items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={goToPrev}
                    className="inline-flex h-11 w-11 items-center justify-center text-slate-500 transition hover:bg-pink-50 hover:text-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                    aria-label="上一页"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="h-6 w-px bg-slate-200" />
                  <button
                    type="button"
                    onClick={goToNext}
                    className="inline-flex h-11 w-11 items-center justify-center text-slate-500 transition hover:bg-pink-50 hover:text-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                    aria-label="下一页"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <Button variant="outline" className="h-11 rounded-2xl bg-white px-5" onClick={goToToday}>
                  今天
                </Button>

                <div className="inline-flex h-11 items-center rounded-2xl bg-slate-100 p-1">
                  {VIEW_OPTIONS.map(item => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => changeView(item.value)}
                      className={`flex min-w-[46px] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        calendarViewMode === item.value ? 'bg-white text-pink-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            className="rounded-[32px]"
            bodyClassName="space-y-5"
          >
            <div className="rounded-[28px] border border-slate-100 bg-gradient-to-r from-white via-pink-50/35 to-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(['MEETING', 'WORK', 'PERSONAL'] as ScheduleEventType[]).map(type => (
                    <span key={type} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${EVENT_TYPE_META[type].badgeClass}`}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EVENT_TYPE_META[type].color }} />
                      {EVENT_TYPE_META[type].label}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-slate-400">点击空白区域快速创建，点击事件查看详情</div>
              </div>
            </div>

            <div className="schedule-calendar relative h-[720px] md:h-[760px] xl:h-[820px]">
              <style>{`
                .schedule-calendar { --cf-pink-50: #fdf2f8; --cf-pink-100: #fce7f3; --cf-pink-200: #fbcfe8; --cf-pink-300: #f9a8d4; --cf-pink-500: #ec4899; --cf-slate-50: #f8fafc; --cf-slate-200: #e2e8f0; --cf-slate-400: #94a3b8; --cf-slate-500: #64748b; --cf-slate-700: #334155; --cf-slate-900: #0f172a; }
                .schedule-calendar .fc { height: 100%; color: var(--cf-slate-900); }
                .schedule-calendar .fc-theme-standard td, .schedule-calendar .fc-theme-standard th { border-color: rgba(226, 232, 240, 0.92); }
                .schedule-calendar .fc-scrollgrid, .schedule-calendar .fc-theme-standard .fc-scrollgrid { border: 1px solid rgba(226, 232, 240, 0.95); border-radius: 30px; overflow: hidden; background: radial-gradient(circle at top right, rgba(252, 231, 243, 0.85), transparent 35%), linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92); }
                .schedule-calendar .fc-header-toolbar { display: none !important; }
                .schedule-calendar .fc-col-header-cell { background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em; color: var(--cf-slate-500); padding: 0.7rem 0; text-transform: uppercase; }
                .schedule-calendar .fc-daygrid-day-frame { min-height: 118px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.84) 100%); transition: background 0.2s ease; }
                .schedule-calendar .fc-daygrid-day:hover .fc-daygrid-day-frame { background: linear-gradient(180deg, rgba(253, 242, 248, 0.7) 0%, rgba(255, 255, 255, 0.98) 100%); }
                .schedule-calendar .fc-day-today .fc-daygrid-day-frame, .schedule-calendar .fc-day-today .fc-timegrid-col-frame { background: radial-gradient(circle at top, rgba(252, 231, 243, 0.85), transparent 52%), linear-gradient(180deg, rgba(255, 247, 250, 0.95) 0%, rgba(255, 255, 255, 0.92) 100%); box-shadow: inset 0 0 0 1px rgba(249, 168, 212, 0.55); }
                .schedule-calendar .fc-daygrid-day-number { margin: 0.45rem 0.55rem 0 0; border-radius: 999px; padding: 0.2rem 0.55rem; font-size: 0.82rem; font-weight: 700; color: var(--cf-slate-700); }
                .schedule-calendar .fc-day-today .fc-daygrid-day-number { background: var(--cf-pink-500); color: #fff; box-shadow: 0 8px 16px rgba(236, 72, 153, 0.28); }
                .schedule-calendar .fc-day-other .fc-daygrid-day-number { color: var(--cf-slate-400); }
                .schedule-calendar .fc-daygrid-day-events { margin-top: 0.15rem; padding: 0 0.2rem 0.3rem; }
                .schedule-calendar .fc-event { cursor: pointer; border: none !important; border-radius: 16px !important; box-shadow: 0 10px 24px -16px rgba(15, 23, 42, 0.65); }
                .schedule-calendar .fc-event-main { padding: 0 !important; }
                .schedule-calendar .fc-dayGridMonth-view .fc-event { margin: 4px 6px 0; }
                .schedule-calendar .fc-timegrid-event { border-radius: 18px !important; }
                .schedule-calendar .fc-timegrid-axis, .schedule-calendar .fc-timegrid-slot-label { background: rgba(255, 255, 255, 0.85); }
                .schedule-calendar .fc-timegrid-slot-label-cushion, .schedule-calendar .fc-timegrid-axis-cushion { font-size: 0.75rem; color: var(--cf-slate-500); }
                .schedule-calendar .fc-timegrid-now-indicator-line { border-color: rgba(236, 72, 153, 0.7) !important; }
                .schedule-calendar .fc-timegrid-now-indicator-arrow { border-top-color: rgba(236, 72, 153, 0.7) !important; border-bottom-color: rgba(236, 72, 153, 0.7) !important; }
                .schedule-calendar .fc-more-link { display: inline-flex; align-items: center; gap: 0.25rem; border-radius: 999px; background: var(--cf-pink-50); color: var(--cf-pink-500); font-weight: 700; padding: 0.2rem 0.55rem; margin: 0.25rem 0.35rem 0; }
                .schedule-calendar .fc-popover { border: 1px solid rgba(251, 207, 232, 0.82); border-radius: 22px; overflow: hidden; box-shadow: 0 28px 48px -28px rgba(236, 72, 153, 0.45); }
                .schedule-calendar .fc-popover-header { background: linear-gradient(180deg, #fff 0%, #fdf2f8 100%); color: var(--cf-slate-700); font-weight: 700; padding: 0.8rem 1rem; }
                .schedule-calendar .fc-popover-body { background: rgba(255, 255, 255, 0.97); padding: 0.5rem; }
                .schedule-calendar .fc-highlight { background: rgba(236, 72, 153, 0.12) !important; }
              `}</style>
              {isLoadingEvents && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[30px] bg-white/55 backdrop-blur-[2px]">
                  <div className="rounded-full border border-pink-100 bg-white/90 px-4 py-2 text-sm font-medium text-pink-600 shadow-sm">正在同步日程...</div>
                </div>
              )}
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                headerToolbar={false}
                initialView="dayGridMonth"
                locale="zh-cn"
                selectable
                selectMirror
                editable={false}
                dayMaxEvents={3}
                weekends
                expandRows
                events={events}
                datesSet={handleDatesSet}
                select={handleDateSelect}
                eventClick={handleEventClick}
                eventContent={(eventInfo: EventContentArg) => {
                  const type = eventInfo.event.extendedProps.type as ScheduleEventType;
                  const isMonthView = eventInfo.view.type === 'dayGridMonth';
                  const title = eventInfo.event.extendedProps.originalTitle || eventInfo.event.title;
                  const roomName = eventInfo.event.extendedProps.roomName as string | undefined;
                  if (isMonthView) {
                    return (
                      <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-white">
                        <span className="h-2 w-2 rounded-full bg-white/75" />
                        {eventInfo.timeText ? <span className="shrink-0 text-white/80">{eventInfo.timeText}</span> : null}
                        <span className="truncate">{title}</span>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-1 px-2.5 py-2 text-white">
                      <div className="text-[11px] font-medium text-white/80">{eventInfo.timeText || EVENT_TYPE_META[type].label}</div>
                      <div className="text-sm font-semibold leading-5">{title}</div>
                      {roomName ? (
                        <div className="flex items-center gap-1 text-[11px] text-white/80">
                          <MapPin size={11} />
                          <span className="truncate">{roomName}</span>
                        </div>
                      ) : null}
                    </div>
                  );
                }}
              />
            </div>
          </WorkspaceSectionCard>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-white/80 bg-white/80 p-5 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <SectionHeader eyebrow="今日安排" title="今日日程" />
              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">{todayEvents.length} 项</span>
            </div>

            <div className="mt-5 space-y-3">
              {todayEvents.length === 0 ? (
                <WorkspaceInlineState
                  title="今天暂时没有安排"
                  description="你可以留出整块时间处理深度工作，或者提前补充下周计划。"
                  className="py-6"
                />
              ) : (
                todayEvents.slice(0, 3).map(event => {
                  const meta = EVENT_TYPE_META[event.extendedProps.type];
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() =>
                        setSelectedEvent({
                          id: event.id,
                          title: event.extendedProps.originalTitle,
                          description: event.extendedProps.description,
                          type: event.extendedProps.type,
                          roomId: event.extendedProps.roomId,
                          roomName: event.extendedProps.roomName,
                          startTime: event.extendedProps.startTime,
                          endTime: event.extendedProps.endTime,
                          allDay: event.allDay,
                          originalTitle: event.extendedProps.originalTitle,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-4 text-left transition hover:border-pink-200 hover:bg-pink-50/35"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>{meta.label}</span>
                        <span className="text-xs font-medium text-slate-400">
                          {event.allDay ? '全天' : timeFormatter.format(getSafeDate(event.extendedProps.startTime) ?? now)}
                        </span>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-900">{event.extendedProps.originalTitle}</div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">{formatEventSlot(event)}</div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="rounded-[28px] border-white/80 bg-white/80 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <SectionHeader eyebrow="即将开始" title="即将到来" />
              <Button variant="ghost" className="rounded-xl px-3" onClick={goToToday}>
                今日
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              {upcomingEvents.length === 0 ? (
                <WorkspaceInlineState
                  title="当前视图中没有即将开始的安排"
                  description="切换到其他日期或创建新的事项后，这里会自动更新节奏提醒。"
                  className="py-6"
                />
              ) : (
                upcomingEvents.map(event => {
                  const meta = EVENT_TYPE_META[event.extendedProps.type];
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() =>
                        setSelectedEvent({
                          id: event.id,
                          title: event.extendedProps.originalTitle,
                          description: event.extendedProps.description,
                          type: event.extendedProps.type,
                          roomId: event.extendedProps.roomId,
                          roomName: event.extendedProps.roomName,
                          startTime: event.extendedProps.startTime,
                          endTime: event.extendedProps.endTime,
                          allDay: event.allDay,
                          originalTitle: event.extendedProps.originalTitle,
                        })
                      }
                      className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-2 py-2 text-left transition hover:border-pink-100 hover:bg-pink-50/35"
                    >
                      <div className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: meta.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate text-sm font-semibold text-slate-900">{event.extendedProps.originalTitle}</div>
                          <div className="shrink-0 text-xs font-medium text-slate-400">
                            {event.allDay ? '全天' : timeFormatter.format(getSafeDate(event.extendedProps.startTime) ?? now)}
                          </div>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{formatEventSlot(event)}</div>
                        {event.extendedProps.roomName ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                            <MapPin size={12} />
                            <span className="truncate">{event.extendedProps.roomName}</span>
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="rounded-[28px] border-white/80 bg-white/80 p-5 backdrop-blur-xl">
            <SectionHeader eyebrow="类型拆分" title="日程类型" />
            <div className="mt-4 space-y-3">
              {(['MEETING', 'WORK', 'PERSONAL'] as ScheduleEventType[]).map(type => (
                <div key={type} className="rounded-2xl border border-slate-100 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: EVENT_TYPE_META[type].color }} />
                      <span className="text-sm font-semibold text-slate-900">{EVENT_TYPE_META[type].label}</span>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${EVENT_TYPE_META[type].badgeClass}`}>
                      {events.filter(event => event.extendedProps.type === type).length}
                    </span>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">{EVENT_TYPE_META[type].hint}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      </div>

      {isCreateDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-900/28 backdrop-blur-sm" onClick={closeCreateDrawer} />
          <div className="absolute inset-y-0 right-0 flex max-w-full">
            <div className="relative w-screen max-w-[480px]">
              <div className="flex h-full flex-col bg-white shadow-[0_30px_60px_rgba(15,23,42,0.16)]">
                <div className="relative overflow-hidden border-b border-slate-100 px-6 pb-6 pt-7">
                  <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_right,_rgba(244,114,182,0.18),_transparent_60%)]" />
                  <div className="relative flex items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">
                        <Plus size={14} />
                        新建日程
                      </div>
                      <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">把新安排放进你的节奏板</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{selectionSummary}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={closeCreateDrawer}
                    >
                      <X size={18} />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                  <div className="rounded-[24px] border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-white p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-500">已选时间</div>
                    <div className="mt-3 text-sm font-medium leading-6 text-slate-700">
                      {form.startTime && form.endTime ? formatDateRange(form.startTime, form.endTime, Boolean(form.isAllDay)) : '请先补充时间信息'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">日程主题</Label>
                    <Input
                      type="text"
                      placeholder="例如：项目评审、客户回访、个人学习"
                      className="h-12 rounded-2xl"
                      value={form.title || ''}
                      onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">日程类型</Label>
                      <Select value={form.type} onValueChange={value => setForm(prev => ({ ...prev, type: value as ScheduleEventType }))}>
                        <SelectTrigger className="h-12 rounded-2xl">
                          <SelectValue placeholder="请选择日程类型" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERSONAL">个人事项</SelectItem>
                          <SelectItem value="WORK">工作安排</SelectItem>
                          <SelectItem value="MEETING">会议预订</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end">
                      <label className="inline-flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:border-pink-200 hover:bg-pink-50/50">
                        <input
                          type="checkbox"
                          checked={Boolean(form.isAllDay)}
                          onChange={event => setForm(prev => ({ ...prev, isAllDay: event.target.checked }))}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        全天事项
                      </label>
                    </div>
                  </div>

                  {!form.isAllDay && (
                    <div className="grid grid-cols-1 gap-4 rounded-[24px] border border-slate-100 bg-slate-50/80 p-5">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <Clock3 size={14} className="text-pink-500" />
                          开始时间
                        </Label>
                        <DatePicker
                          type="datetime-local"
                          value={form.startTime ? toLocalDatetimeString(form.startTime) : ''}
                          onChange={event => setForm(prev => ({ ...prev, startTime: toBackendDateString(event.target.value) }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <Clock3 size={14} className="text-pink-500" />
                          结束时间
                        </Label>
                        <DatePicker
                          type="datetime-local"
                          value={form.endTime ? toLocalDatetimeString(form.endTime) : ''}
                          onChange={event => setForm(prev => ({ ...prev, endTime: toBackendDateString(event.target.value) }))}
                        />
                      </div>
                    </div>
                  )}

                  {form.isAllDay && (
                    <div className="rounded-[24px] border border-amber-100 bg-amber-50/80 p-5 text-sm leading-6 text-amber-700">
                      当前已设置为全天事项，时间会按照完整日期范围展示。如果需要精确到小时，请关闭“全天事项”后重新选择时间。
                    </div>
                  )}

                  {form.type === 'MEETING' && (
                    <div className="rounded-[24px] border border-pink-100 bg-pink-50/70 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-pink-700">
                        <MapPin size={14} />
                        会议室预订说明
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        当前页面用于个人日程创建。若需要绑定会议室资源，请前往侧边栏中的“会议室管理”完成正式预订，再回到日历查看占用情况。
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <FileText size={14} />
                      备注说明
                    </Label>
                    <Textarea
                      placeholder="补充议程、目标、注意事项或提醒信息"
                      className="min-h-[140px] rounded-2xl resize-none"
                      value={form.description || ''}
                      onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-6 py-5">
                  <Button variant="outline" className="h-12 rounded-2xl" onClick={closeCreateDrawer}>
                    取消
                  </Button>
                  <Button className="h-12 rounded-2xl shadow-[0_16px_34px_rgba(236,72,153,0.22)]" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? '正在创建...' : '创建日程'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-900/28 backdrop-blur-sm" onClick={() => setSelectedEvent(null)} />
          <div className="absolute inset-y-0 right-0 flex max-w-full">
            <div className="relative w-screen max-w-[440px]">
              <div className="flex h-full flex-col bg-white shadow-[0_30px_60px_rgba(15,23,42,0.16)]">
                <div className="border-b border-slate-100 px-6 pb-6 pt-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${EVENT_TYPE_META[selectedEvent.type].badgeClass}`}>
                        {EVENT_TYPE_META[selectedEvent.type].label}
                      </span>
                      <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{selectedEvent.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{formatEventSlot(selectedEvent)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => setSelectedEvent(null)}
                    >
                      <X size={18} />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                  <div className="rounded-[24px] border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-white p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-500">时间摘要</div>
                    <div className="mt-3 text-sm font-medium text-slate-700">{formatEventSlot(selectedEvent)}</div>
                    <div className="mt-2 text-xs text-slate-500">预计占用：{getDurationLabel(selectedEvent.startTime, selectedEvent.endTime, selectedEvent.allDay)}</div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-100 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">类型定位</div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">{EVENT_TYPE_META[selectedEvent.type].hint}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Clock3 size={14} className="text-pink-500" />
                        时间范围
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">{formatDateRange(selectedEvent.startTime, selectedEvent.endTime, selectedEvent.allDay)}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <MapPin size={14} className="text-pink-500" />
                        会议室 / 地点
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">{selectedEvent.roomName || '未绑定会议室'}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <FileText size={14} className="text-pink-500" />
                        备注说明
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">{selectedEvent.description?.trim() || '暂无补充备注'}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-6 py-5">
                  <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setSelectedEvent(null)}>
                    关闭
                  </Button>
                  <Button variant="destructive" className="h-12 rounded-2xl" onClick={handleDeleteSelectedEvent} disabled={isDeleting}>
                    <Trash2 size={16} className="mr-2" />
                    {isDeleting ? '正在删除...' : '删除日程'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
