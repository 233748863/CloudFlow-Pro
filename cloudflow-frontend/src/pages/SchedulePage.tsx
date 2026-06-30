import React, { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventInput,
} from '@fullcalendar/core';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DatePicker,
  Input,
  Label,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { useAuth } from '@/context/AuthContext';
import { createEvent, deleteEvent, getMeetingRooms, getMyEvents } from '../services/api/schedule';
import type { MeetingRoom, SysScheduleEvent } from '../types';
import {
  parseBackendDate,
  toBackendDateString,
  toLocalDatetimeString,
  toQueryDateString,
} from '../utils/dateFormat';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type ScheduleEventType = SysScheduleEvent['type'];
type CalendarViewMode = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
type ScheduleFilterScope = 'ALL' | 'TODAY' | 'UPCOMING' | 'ALL_DAY';
type ScheduleTypeFilter = ScheduleEventType | 'ALL';

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

type ScheduleEventLike = ScheduleCalendarEvent | SelectedEventDetail;

interface ScheduleTableFilters {
  keyword: string;
  scope: ScheduleFilterScope;
  type: ScheduleTypeFilter;
}

interface EventTimingMeta {
  label: string;
  hint: string;
  badgeClass: string;
}

const EVENT_TYPE_META: Record<
  ScheduleEventType,
  { label: string; color: string; badgeClass: string; softClass: string; hint: string }
> = {
  MEETING: {
    label: '会议',
    color: '#0e7490',
    badgeClass: 'bg-cyan-500/10 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-200 dark:border-cyan-900',
    softClass: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200',
    hint: '适合评审、同步和客户沟通等需要明确地点或固定时段的安排。',
  },
  WORK: {
    label: '工作',
    color: '#047857',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900',
    softClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
    hint: '适合项目推进、交付节点和需要整块时间推进的任务。',
  },
  PERSONAL: {
    label: '个人',
    color: '#b45309',
    badgeClass: 'bg-amber-500/10 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900',
    softClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200',
    hint: '适合个人安排、生活提醒和不需要额外资源绑定的事项。',
  },
};

const VIEW_OPTIONS: Array<{ value: CalendarViewMode; label: string }> = [
  { value: 'dayGridMonth', label: '月' },
  { value: 'timeGridWeek', label: '周' },
  { value: 'timeGridDay', label: '日' },
];

const TABLE_FILTER_SCOPE_OPTIONS: Array<{ value: ScheduleFilterScope; label: string }> = [
  { value: 'ALL', label: '全部时间' },
  { value: 'TODAY', label: '今日日程' },
  { value: 'UPCOMING', label: '即将开始' },
  { value: 'ALL_DAY', label: '全天事项' },
];

const DEFAULT_TABLE_FILTERS: ScheduleTableFilters = {
  keyword: '',
  scope: 'ALL',
  type: 'ALL',
};

const TABLE_PAGE_SIZE = 8;

const monthDayFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' });
const yearMonthFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
const dateOnlyFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const longDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const getSafeDate = (value: string) => {
  const date = parseBackendDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getInclusiveEnd = (date: Date) => new Date(date.getTime() - 1000);

const toLocalDateString = (value: string | Date) => {
  const date = typeof value === 'string' ? getSafeDate(value) : value;
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDayBoundaryString = (dateValue: string, boundary: 'start' | 'end') => {
  if (!dateValue) return '';
  return `${dateValue} ${boundary === 'start' ? '00:00:00' : '23:59:59'}`;
};

const createDefaultForm = (
  range?: { start: Date; end: Date; allDay?: boolean } | null,
): Partial<SysScheduleEvent> => {
  const start = range?.start ?? new Date();
  const rawEnd = range?.end ?? new Date(start.getTime() + 60 * 60 * 1000);
  const isAllDay = Boolean(range?.allDay);
  const inclusiveEnd = isAllDay ? getInclusiveEnd(rawEnd) : rawEnd;

  // FullCalendar 全天选择的结束时间是“次日 00:00”，这里先收敛到当天边界，避免直接提交时出现偏移。
  return {
    title: '',
    description: '',
    type: 'PERSONAL',
    isAllDay,
    startTime: isAllDay
      ? toDayBoundaryString(toLocalDateString(start), 'start')
      : toBackendDateString(start),
    endTime: isAllDay
      ? toDayBoundaryString(toLocalDateString(inclusiveEnd), 'end')
      : toBackendDateString(rawEnd),
  };
};

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
        subtitle: '周视图 · 7 天安排',
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

const getEventTimeValues = (event: ScheduleEventLike) => {
  const startTime = 'extendedProps' in event ? event.extendedProps.startTime : event.startTime;
  const endTime = 'extendedProps' in event ? event.extendedProps.endTime : event.endTime;
  return {
    startTime,
    endTime,
    start: getSafeDate(startTime),
    end: getSafeDate(endTime),
  };
};

const formatEventSlot = (event: ScheduleEventLike) => {
  const { startTime, endTime } = getEventTimeValues(event);
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
  if (hours > 0 && minutes > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (hours > 0) return `${hours} 小时`;
  return `${minutes} 分钟`;
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

const toSelectedEvent = (event: ScheduleCalendarEvent): SelectedEventDetail => ({
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
});

const getLocationLabel = (type: ScheduleEventType, roomName?: string | null) => {
  if (roomName) return roomName;
  return type === 'MEETING' ? '未绑定会议室' : '个人安排';
};

const getEventLocationLabel = (event: ScheduleCalendarEvent) => {
  return getLocationLabel(event.extendedProps.type, event.extendedProps.roomName);
};

const matchesTableScope = (event: ScheduleCalendarEvent, scope: ScheduleFilterScope, now: Date) => {
  switch (scope) {
    case 'TODAY':
      return isEventOnDay(event, now);
    case 'UPCOMING': {
      const end = getSafeDate(event.extendedProps.endTime);
      return end ? end.getTime() >= now.getTime() : false;
    }
    case 'ALL_DAY':
      return event.allDay;
    default:
      return true;
  }
};

const getEventSearchText = (event: ScheduleCalendarEvent) =>
  [
    event.extendedProps.originalTitle,
    event.extendedProps.description,
    event.extendedProps.roomName,
    EVENT_TYPE_META[event.extendedProps.type].label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

// 统一计算日程在当前时间点的状态，供概览、表格和详情抽屉复用。
const getEventTimingMeta = (event: ScheduleEventLike, referenceDate: Date): EventTimingMeta => {
  const { start, end } = getEventTimeValues(event);

  if (!start || !end) {
    return {
      label: '时间异常',
      hint: '请检查开始时间和结束时间',
      badgeClass: 'bg-[var(--cf-surface-muted)] text-slate-500 border border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800',
    };
  }

  if (end.getTime() <= referenceDate.getTime()) {
    return {
      label: '已结束',
      hint: `结束于 ${start.toDateString() === end.toDateString() ? timeFormatter.format(end) : monthDayFormatter.format(end)}`,
      badgeClass: 'bg-[var(--cf-surface-muted)] text-slate-600 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800',
    };
  }

  if (start.getTime() <= referenceDate.getTime()) {
    if (event.allDay) {
      return {
        label: '全天进行中',
        hint: '当前日期整天占用',
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900',
      };
    }

    return {
      label: '进行中',
      hint: `截至 ${timeFormatter.format(end)}`,
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900',
    };
  }

  const startHint =
    start.toDateString() === referenceDate.toDateString()
      ? `今日 ${timeFormatter.format(start)}`
      : `${monthDayFormatter.format(start)} 开始`;
  const diffHours = (start.getTime() - referenceDate.getTime()) / (60 * 60 * 1000);

  if (diffHours <= 24) {
    return {
      label: '即将开始',
      hint: startHint,
      badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-900',
    };
  }

  return {
    label: '待开始',
    hint: startHint,
    badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-900',
  };
};

const InlineState = ({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
    <div className="admin-source-stat-icon mb-3">
      {icon || <Calendar className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow = ({
  colSpan,
  title,
  description,
  icon,
  loading = false,
}: {
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : icon || <Calendar className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

const DialogPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, actions, children, className, bodyClassName }) => (
  <section className={cn('table-scroll-container admin-inner-table-surface', className)}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={cn('p-4', bodyClassName)}>{children}</div>
  </section>
);

const ScheduleDetailRows: React.FC<{
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}> = ({ children, title = '日程主信息', description, className }) => (
  <DialogPanel title={title} description={description} bodyClassName={cn('admin-schedule-detail-grid', className)}>
    {children}
  </DialogPanel>
);

const ScheduleDetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}> = ({ label, value, wide = false }) => (
  <div className={cn('admin-schedule-detail-item', wide && 'admin-schedule-detail-item-wide')}>
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
  </div>
);

export const SchedulePage = () => {
  const { user, hasPermission } = useAuth();
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
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm] = useState<Partial<SysScheduleEvent>>(createDefaultForm());
  const [tableFilters, setTableFilters] = useState<ScheduleTableFilters>(DEFAULT_TABLE_FILTERS);
  const [tablePageNum, setTablePageNum] = useState(1);
  const canCreateSchedule = hasPermission('oa:schedule:add');
  const canDeleteSchedule = hasPermission('oa:schedule:remove');

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
      setEvents(
        eventList.map(item => {
          const meta = EVENT_TYPE_META[item.type];
          return {
            id: String(item.eventId),
            title: item.title,
            start: item.startTime,
            end: item.endTime,
            allDay: item.isAllDay,
            backgroundColor: meta.color,
            borderColor: meta.color,
            display: 'block',
            classNames: ['cf-event', `cf-event--${item.type.toLowerCase()}`],
            extendedProps: {
              originalTitle: item.title,
              description: item.description,
              type: item.type,
              roomId: item.roomId,
              roomName: getRoomName(item.roomId, rooms),
              startTime: item.startTime,
              endTime: item.endTime,
            },
          } satisfies ScheduleCalendarEvent;
        }),
      );
    } catch (error) {
      console.error('加载日程失败', error);
      setLoadError('当前日程加载失败，请稍后重试');
      toast.error('加载日程失败，请稍后重试');
    } finally {
      setIsLoadingEvents(false);
    }
  };
  const refreshCurrentWindow = async () => {
    if (currentViewRange.current) {
      await fetchEvents(currentViewRange.current.start, currentViewRange.current.end);
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
    if (!canCreateSchedule) {
      toast.error('当前账号没有新建日程权限');
      return;
    }
    setSelectedEvent(null);
    setSelectedDate(range ? { start: range.start, end: range.end, allDay: Boolean(range.allDay) } : null);
    setForm(createDefaultForm(range));
    setIsCreateDrawerOpen(true);
  };

  const closeCreateDrawer = () => {
    setIsCreateDrawerOpen(false);
    setSelectedDate(null);
  };

  const openEventDetail = (event: ScheduleCalendarEvent) => {
    setIsCreateDrawerOpen(false);
    setSelectedEvent(toSelectedEvent(event));
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
    const displayContent = getViewDisplayContent(
      dateInfo.view.currentStart,
      dateInfo.view.currentEnd,
      viewType,
    );
    setCalendarTitle(displayContent.title);
    setCalendarWindowLabel(displayContent.subtitle);
    void fetchEvents(dateInfo.start, dateInfo.end);
  };

  const handleResetTableFilters = () => {
    setTableFilters(DEFAULT_TABLE_FILTERS);
    setTablePageNum(1);
  };

  const handleTableTypeChange = (value: string) => {
    const nextType = (value || 'ALL') as ScheduleTypeFilter;
    setTableFilters(prev => ({ ...prev, type: nextType }));
    setTablePageNum(1);
  };

  const handleFormTypeChange = (value: string) => {
    const nextType = value as ScheduleEventType;
    setForm(prev => ({
      ...prev,
      type: nextType,
      roomId: nextType === 'MEETING' ? prev.roomId : undefined,
    }));
  };

  const handleAllDayToggle = (checked: boolean) => {
    // 全天事项需要把时间钉到当天边界，避免后端收到不完整的时间范围。
    setForm(prev => {
      if (checked) {
        const startDate = prev.startTime ? toLocalDateString(prev.startTime) : toLocalDateString(new Date());
        const endDate = prev.endTime ? toLocalDateString(prev.endTime) : startDate;
        return {
          ...prev,
          isAllDay: true,
          startTime: toDayBoundaryString(startDate, 'start'),
          endTime: toDayBoundaryString(endDate, 'end'),
        };
      }

      const nextStart = prev.startTime ? toLocalDatetimeString(prev.startTime) : toLocalDatetimeString(new Date());
      const nextEnd = prev.endTime
        ? toLocalDatetimeString(prev.endTime)
        : toLocalDatetimeString(new Date(Date.now() + 60 * 60 * 1000));
      return {
        ...prev,
        isAllDay: false,
        startTime: toBackendDateString(nextStart),
        endTime: toBackendDateString(nextEnd),
      };
    });
  };

  const handleSubmit = async () => {
    if (!form.title?.trim()) {
      toast.error('请输入日程主题');
      return;
    }
    if (!form.startTime || !form.endTime) {
      toast.error('请补全开始时间和结束时间');
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
      await refreshCurrentWindow();
    } catch (error) {
      console.error('创建日程失败', error);
      toast.error('创建失败，可能与已有安排发生时间冲突');
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteSelectedEvent = () => {
    if (!selectedEvent) return;
    if (!canDeleteSchedule) {
      toast.error('当前账号没有删除日程权限');
      return;
    }
    setPendingDelete({ id: selectedEvent.id, title: selectedEvent.title || '该日程' });
  };

  const handleDeleteFromTable = (event: ScheduleCalendarEvent) => {
    if (!canDeleteSchedule) {
      toast.error('当前账号没有删除日程权限');
      return;
    }
    setPendingDelete({ id: event.id, title: event.extendedProps.originalTitle || event.title || '该日程' });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setIsDeleting(true);
    try {
      await deleteEvent(id);
      toast.success('日程已删除');
      if (selectedEvent?.id === id) {
        setSelectedEvent(null);
      }
      await refreshCurrentWindow();
      setPendingDelete(null);
    } catch (error) {
      console.error('删除日程失败', error);
      toast.error('删除失败，请稍后重试');
    } finally {
      setIsDeleting(false);
    }
  };

  const now = new Date();
  const todayEvents = sortEventsByStart(events.filter(event => isEventOnDay(event, now)));
  const ongoingEvents = sortEventsByStart(
    events.filter(event => {
      const start = getSafeDate(event.extendedProps.startTime);
      const end = getSafeDate(event.extendedProps.endTime);
      return start && end ? start.getTime() <= now.getTime() && end.getTime() > now.getTime() : false;
    }),
  );
  const nextStartingEvents = sortEventsByStart(
    events.filter(event => {
      const start = getSafeDate(event.extendedProps.startTime);
      return start ? start.getTime() >= now.getTime() : false;
    }),
  );
  const todayOngoingCount = ongoingEvents.filter(event => isEventOnDay(event, now)).length;
  const next24HourBoundary = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const next24HourEventsCount = nextStartingEvents.filter(event => {
    const start = getSafeDate(event.extendedProps.startTime);
    return start ? start.getTime() <= next24HourBoundary.getTime() : false;
  }).length;

  // 表格工作台与日历共用同一份事件数据，避免两套视图状态不一致。
  const normalizedTableKeyword = tableFilters.keyword.trim().toLocaleLowerCase();
  const filteredTableEvents = sortEventsByStart(
    events.filter(event => {
      const matchesType = tableFilters.type === 'ALL' || event.extendedProps.type === tableFilters.type;
      const matchesScope = matchesTableScope(event, tableFilters.scope, now);
      const matchesKeyword =
        !normalizedTableKeyword || getEventSearchText(event).includes(normalizedTableKeyword);
      return matchesType && matchesScope && matchesKeyword;
    }),
  );
  const tableTotal = filteredTableEvents.length;
  const tableTotalPages = Math.max(1, Math.ceil(tableTotal / TABLE_PAGE_SIZE));
  const tablePageEvents = filteredTableEvents.slice(
    (tablePageNum - 1) * TABLE_PAGE_SIZE,
    tablePageNum * TABLE_PAGE_SIZE,
  );
  const tablePageStart = tableTotal === 0 ? 0 : (tablePageNum - 1) * TABLE_PAGE_SIZE + 1;
  const tablePageEnd = tableTotal === 0 ? 0 : Math.min(tableTotal, tablePageNum * TABLE_PAGE_SIZE);
  const tableHasActiveFilters = Boolean(
    tableFilters.keyword || tableFilters.scope !== 'ALL' || tableFilters.type !== 'ALL',
  );
  const tableScopeLabel =
    TABLE_FILTER_SCOPE_OPTIONS.find(option => option.value === tableFilters.scope)?.label || '全部时间';
  const tableTypeLabel =
    tableFilters.type === 'ALL' ? '全部类型' : EVENT_TYPE_META[tableFilters.type].label;

  useEffect(() => {
    if (tablePageNum > tableTotalPages) {
      setTablePageNum(tableTotalPages);
    }
  }, [tablePageNum, tableTotalPages]);

  if (!user) return null;

  const currentViewLabel =
    calendarViewMode === 'dayGridMonth'
      ? '月视图'
      : calendarViewMode === 'timeGridWeek'
        ? '周视图'
        : '日视图';
  const selectionSummary = selectedDate
    ? formatDateRangeFromDates(
        selectedDate.start,
        selectedDate.allDay ? getInclusiveEnd(selectedDate.end) : selectedDate.end,
        selectedDate.allDay,
      )
    : '补充主题、时间与备注后即可创建。';
  const draftSchedulePreview =
    form.startTime && form.endTime
      ? formatDateRange(form.startTime, form.endTime, Boolean(form.isAllDay))
      : selectionSummary;
  const draftMeetingRoomLabel = form.roomId ? getRoomName(form.roomId) : null;
  const selectedEventTimingMeta = selectedEvent ? getEventTimingMeta(selectedEvent, now) : null;
  const listSummary = [
    tableScopeLabel,
    tableTypeLabel,
    tableFilters.keyword ? `关键词：${tableFilters.keyword}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const scheduleStats = [
    { label: '今日安排', value: String(todayEvents.length), meta: currentViewLabel, icon: Calendar, tone: 'blue' },
    { label: '进行中', value: String(todayOngoingCount), meta: '当前时间占用', icon: Clock3, tone: 'green' },
    { label: '24 小时内', value: String(next24HourEventsCount), meta: '即将开始', icon: ChevronRight, tone: 'amber' },
    { label: '列表记录', value: String(tableTotal), meta: tableHasActiveFilters ? listSummary : tableTypeLabel, icon: FileText, tone: 'violet' },
  ];

  const pageActions = (
    <div className="grid gap-5">
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">SCHEDULE</p>
            <h2>我的日程</h2>
            <span>{calendarWindowLabel || '按日历窗口同步日程、会议和个人安排'}</span>
          </div>
          <div className="admin-source-controls">
            <button className="btn btn-secondary" type="button" onClick={() => void refreshCurrentWindow()}>
              <RotateCcw size={16} />
              刷新
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => calendarRef.current?.getApi().today()}>
              今天
            </button>
            <button className="btn btn-primary" type="button" onClick={() => openCreateDrawer()} disabled={!canCreateSchedule}>
              <Plus size={16} />
              新建日程
            </button>
          </div>
        </header>

        <section className="admin-source-stat-grid">
          {scheduleStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
                <div className="admin-source-stat-icon"><Icon size={18} /></div>
                <div><p>{stat.label}</p><strong>{stat.value}</strong><span>{stat.meta}</span></div>
              </article>
            );
          })}
        </section>
    </div>
  );

  const pageFilters = (
        <section className="card admin-users-toolbar">
          <div className="admin-users-filter-grid">
            <label className="admin-source-search">
              <span className="input-label">搜索日程</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input
                  type="text"
                  placeholder="按标题、备注或会议室搜索"
                  value={tableFilters.keyword}
                  onChange={event => {
                    setTableFilters(prev => ({ ...prev, keyword: event.target.value }));
                    setTablePageNum(1);
                  }}
                />
              </div>
            </label>

            <label>
              <span className="input-label">时间范围</span>
              <Select
                value={tableFilters.scope}
                onValueChange={value => {
                  setTableFilters(prev => ({ ...prev, scope: value as ScheduleFilterScope }));
                  setTablePageNum(1);
                }}
              >
                <SelectTrigger><SelectValue placeholder="时间范围" /></SelectTrigger>
                <SelectContent>
                  {TABLE_FILTER_SCOPE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>

            <label>
              <span className="input-label">日程类型</span>
              <Select value={tableFilters.type} onValueChange={handleTableTypeChange}>
                <SelectTrigger><SelectValue placeholder="日程类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部类型</SelectItem>
                  <SelectItem value="MEETING">会议</SelectItem>
                  <SelectItem value="WORK">工作</SelectItem>
                  <SelectItem value="PERSONAL">个人</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label>
              <span className="input-label">视图</span>
              <SegmentedControl className="min-h-9">
                {VIEW_OPTIONS.map((option) => (
                  <SegmentedControlItem
                    key={option.value}
                    size="sm"
                    active={option.value === calendarViewMode}
                    onClick={() => calendarRef.current?.getApi().changeView(option.value)}
                  >
                    {option.label}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </label>

            <div className="admin-users-toolbar-actions">
              {tableHasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleResetTableFilters}>
                  <RotateCcw size={14} className="mr-1.5" />
                  清空
                </Button>
              ) : null}
            </div>
          </div>
        </section>
  );

  const pageContent = (
        <InnerTableSurface
          className="schedule-page-surface flex flex-col"
          wrapperClassName="flex flex-col"
        >
          <div className="flex flex-col">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {calendarTitle || currentViewLabel}
                  </div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {loadError || (calendarWindowLabel || '日历视图')}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="hidden flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex">
                    <span>今日 {todayEvents.length}</span>
                    <span>进行中 {todayOngoingCount}</span>
                    <span>24 小时内 {next24HourEventsCount}</span>
                  </div>
                  <div className="admin-users-row-actions">
                    <button
                      type="button"
                      onClick={() => calendarRef.current?.getApi().prev()}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-[var(--cf-surface-muted)] hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      aria-label="上一周期"
                      title="上一周期"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => calendarRef.current?.getApi().next()}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-[var(--cf-surface-muted)] hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      aria-label="下一周期"
                      title="下一周期"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {(['MEETING', 'WORK', 'PERSONAL'] as ScheduleEventType[]).map(type => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: EVENT_TYPE_META[type].color }} />
                    {EVENT_TYPE_META[type].label}
                  </span>
                ))}
              </div>
            </div>

            <div className="schedule-calendar relative h-[620px] border-b border-slate-200 dark:border-slate-800 xl:h-[680px]">
                <style>{`
                  .schedule-calendar .fc { height: 100%; color: #0f172a; }
                  .dark .schedule-calendar .fc { color: #e2e8f0; }
                  .schedule-calendar .fc-header-toolbar { display: none !important; }
                  .schedule-calendar .fc-scrollgrid,
                  .schedule-calendar .fc-scrollgrid table,
                  .schedule-calendar .fc-col-header,
                  .schedule-calendar .fc-daygrid-body,
                  .schedule-calendar .fc-daygrid-body table,
                  .schedule-calendar .fc-timegrid-body,
                  .schedule-calendar .fc-timegrid-body table {
                    width: 100% !important;
                    min-width: 0 !important;
                    max-width: 100% !important;
                  }
                  .schedule-calendar .fc-col-header,
                  .schedule-calendar .fc-daygrid-body table,
                  .schedule-calendar .fc-timegrid-body table {
                    table-layout: fixed;
                  }
                  .schedule-calendar colgroup,
                  .schedule-calendar col {
                    width: auto !important;
                  }
                  .schedule-calendar .fc-scrollgrid,
                  .schedule-calendar .fc-theme-standard .fc-scrollgrid {
                    overflow: hidden;
                    border-radius: 0;
                    border: 0;
                    background: transparent;
                  }
                  .dark .schedule-calendar .fc-scrollgrid,
                  .dark .schedule-calendar .fc-theme-standard .fc-scrollgrid {
                    border-color: transparent;
                    background: transparent;
                  }
                  .schedule-calendar .fc-col-header-cell {
                    background: rgba(248, 250, 252, 0.92);
                  }
                  .dark .schedule-calendar .fc-col-header-cell {
                    background: rgba(15, 23, 42, 0.92);
                  }
                  .schedule-calendar .fc-daygrid-day-frame { min-height: 96px; }
                  .schedule-calendar .fc-day-today {
                    background: rgba(8, 145, 178, 0.06) !important;
                  }
                  .dark .schedule-calendar .fc-day-today {
                    background: rgba(8, 145, 178, 0.12) !important;
                  }
                  .schedule-calendar .fc-daygrid-day-number,
                  .schedule-calendar .fc-col-header-cell-cushion {
                    margin: 0.35rem 0.45rem 0 0;
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: #475569;
                    text-decoration: none;
                  }
                  .dark .schedule-calendar .fc-daygrid-day-number,
                  .dark .schedule-calendar .fc-col-header-cell-cushion {
                    color: #cbd5e1;
                  }
                  .schedule-calendar .fc-day-other .fc-daygrid-day-number {
                    color: #94a3b8;
                  }
                  .dark .schedule-calendar .fc-day-other .fc-daygrid-day-number {
                    color: #64748b;
                  }
                  .schedule-calendar .fc-theme-standard td,
                  .schedule-calendar .fc-theme-standard th,
                  .schedule-calendar .fc-timegrid-slot,
                  .schedule-calendar .fc-daygrid-day,
                  .schedule-calendar .fc-col-header-cell {
                    border-color: rgba(226, 232, 240, 0.95);
                  }
                  .dark .schedule-calendar .fc-theme-standard td,
                  .dark .schedule-calendar .fc-theme-standard th,
                  .dark .schedule-calendar .fc-timegrid-slot,
                  .dark .schedule-calendar .fc-daygrid-day,
                  .dark .schedule-calendar .fc-col-header-cell {
                    border-color: rgba(30, 41, 59, 0.95);
                  }
                  .schedule-calendar .fc-event {
                    cursor: pointer;
                    border: 1px solid rgba(255, 255, 255, 0.68) !important;
                    border-radius: 8px !important;
                    box-shadow: none !important;
                    overflow: hidden;
                  }
                  .schedule-calendar .fc-daygrid-event {
                    margin: 2px 4px 0 !important;
                  }
                  .schedule-calendar .fc-daygrid-dot-event {
                    align-items: stretch;
                    background: var(--fc-event-bg-color) !important;
                    border-color: var(--fc-event-border-color) !important;
                    color: #ffffff !important;
                    padding: 0 !important;
                  }
                  .schedule-calendar .fc-daygrid-dot-event:hover,
                  .schedule-calendar .fc-daygrid-dot-event:focus {
                    background: var(--fc-event-bg-color) !important;
                    color: #ffffff !important;
                  }
                  .schedule-calendar .fc-daygrid-dot-event .fc-daygrid-event-dot {
                    display: none;
                  }
                  .schedule-calendar .fc-daygrid-more-link {
                    margin: 3px 4px 0;
                    border-radius: 6px;
                    background: #f1f5f9;
                    color: #0f172a;
                    font-size: 0.75rem;
                    font-weight: 700;
                    line-height: 1.6;
                    padding: 0 6px;
                  }
                  .schedule-calendar .fc-daygrid-more-link:hover {
                    background: #e2e8f0;
                    color: #0f172a;
                    text-decoration: none;
                  }
                  .dark .schedule-calendar .fc-daygrid-more-link {
                    background: #1e293b;
                    color: #e2e8f0;
                  }
                  .dark .schedule-calendar .fc-daygrid-more-link:hover {
                    background: #334155;
                    color: #f8fafc;
                  }
                  .schedule-calendar .fc-event-main { padding: 0 !important; }
                  .schedule-calendar .fc-timegrid-axis,
                  .schedule-calendar .fc-timegrid-slot-label-cushion {
                    color: #94a3b8;
                    font-size: 0.75rem;
                  }
                `}</style>
                {isLoadingEvents ? (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--cf-surface-strong)] dark:bg-slate-950">
                    <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-2 text-sm font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      正在同步日程...
                    </div>
                  </div>
                ) : null}
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  headerToolbar={false}
                  initialView="dayGridMonth"
                  locale="zh-cn"
                  selectable
                  selectMirror
                  editable={false}
                  dayMaxEvents={2}
                  weekends
                  expandRows
                  events={events}
                  datesSet={handleDatesSet}
                  select={handleDateSelect}
                  eventClick={handleEventClick}
                  eventContent={(eventInfo: EventContentArg) => {
                    const type = eventInfo.event.extendedProps.type as ScheduleEventType;
                    const title = eventInfo.event.extendedProps.originalTitle || eventInfo.event.title;
                    const roomName = eventInfo.event.extendedProps.roomName as string | undefined;

                    if (eventInfo.view.type === 'dayGridMonth') {
                      return (
                        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-white">
                          {eventInfo.timeText ? (
                            <span className="shrink-0 text-white/80">{eventInfo.timeText}</span>
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-sm bg-current" />
                          )}
                          <span className="truncate">{title}</span>
                        </div>
                      );
                    }

                    return (
                      <div className="px-2 py-1.5 text-white">
                        <div className="text-[11px] font-medium text-white/80">
                          {eventInfo.timeText || EVENT_TYPE_META[type].label}
                        </div>
                        <div className="truncate text-sm font-semibold leading-5">{title}</div>
                        {roomName ? <div className="truncate text-[11px] text-white/80">{roomName}</div> : null}
                      </div>
                    );
                  }}
                />
            </div>

            <div className="flex-1">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">日程列表</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {tableHasActiveFilters ? listSummary : '按当前时间窗口同步显示日程记录'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {tableTotal > 0 ? `${tablePageStart}-${tablePageEnd} / ${tableTotal}` : '0 / 0'}
                  </div>
                </div>
              </div>

              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th>主题</th>
                      <th>时间</th>
                      <th>地点</th>
                      <th>状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingEvents ? (
                      <TableStateRow colSpan={5} title="正在加载日程列表..." loading />
                    ) : tablePageEvents.length === 0 ? (
                      <TableStateRow
                        colSpan={5}
                        icon={<Calendar size={18} />}
                        title={tableHasActiveFilters ? '当前筛选下暂无匹配日程' : '当前视图暂无日程记录'}
                        description={
                          tableHasActiveFilters
                            ? '可以切换类型、时间范围或清空关键词后重新查看。'
                            : '在日历中创建新安排后，这里会同步显示对应记录。'
                        }
                      />
                    ) : (
                      tablePageEvents.map(event => {
                        const meta = EVENT_TYPE_META[event.extendedProps.type];
                        const statusMeta = getEventTimingMeta(event, now);
                        const description = event.extendedProps.description?.trim();

                        return (
                          <tr key={event.id}>
                            <td>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: meta.color }} />
                                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {event.extendedProps.originalTitle}
                                  </span>
                                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                                    {meta.label}
                                  </span>
                                </div>
                                <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {description || '暂无补充说明'}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div>{formatEventSlot(event)}</div>
                              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                {getDurationLabel(event.extendedProps.startTime, event.extendedProps.endTime, event.allDay)}
                              </div>
                            </td>
                            <td>
                              <div className="inline-flex items-center gap-1.5">
                                <MapPin size={14} className="text-slate-400 dark:text-slate-500" />
                                <span>{getEventLocationLabel(event)}</span>
                              </div>
                            </td>
                            <td>
                              <div className="inline-flex flex-col items-start gap-1">
                                <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${statusMeta.badgeClass}`}>
                                  {statusMeta.label}
                                </span>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">{statusMeta.hint}</span>
                              </div>
                            </td>
                            <td>
                              <div className="admin-users-row-actions justify-end">
                                <button type="button" title="详情" aria-label="详情" onClick={() => openEventDetail(event)}>
                                  <Eye size={15} />
                                </button>
                                <button
                                  className="danger"
                                  type="button"
                                  title="删除"
                                  aria-label="删除"
                                  onClick={() => void handleDeleteFromTable(event)}
                                  disabled={isDeleting || !canDeleteSchedule}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </InnerTableSurface>
  );

  const pagePagination = tableTotal > 0 ? (
    <Pagination
      total={tableTotal}
      page={tablePageNum}
      pageSize={TABLE_PAGE_SIZE}
      showPageSizeSelector={false}
      showJump={false}
      onPageChange={setTablePageNum}
      onPageSizeChange={() => {}}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page schedule-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageContent}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={isCreateDrawerOpen}
        title="新建日程"
        description={selectionSummary}
        onClose={closeCreateDrawer}
        maxWidthClassName="max-w-3xl"
        panelClassName="max-h-[90vh]"
        bodyClassName="admin-dialog-stack max-h-[70vh] overflow-y-auto"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeCreateDrawer}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !canCreateSchedule}>
              {isSubmitting ? '正在创建...' : '创建日程'}
            </Button>
          </div>
        }
      >
        <div className="admin-dialog-stack">
          <DialogPanel title="当前时间范围" description="日历选区会自动带入开始和结束时间">
            <div className="admin-dialog-value-note font-medium">
              {draftSchedulePreview}
            </div>
          </DialogPanel>

          <DialogPanel title="基础信息" bodyClassName="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field md:col-span-2">
              <Label>日程主题</Label>
              <Input
                type="text"
                placeholder="例如：项目评审、客户回访、个人学习"
                className="h-11"
                value={form.title || ''}
                onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
              />
            </div>

            <div className="admin-dialog-field">
              <Label>日程类型</Label>
              <Select value={form.type || 'PERSONAL'} onValueChange={handleFormTypeChange}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择日程类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSONAL">个人事项</SelectItem>
                  <SelectItem value="WORK">工作安排</SelectItem>
                  <SelectItem value="MEETING">会议预约</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === 'MEETING' ? (
              <div className="admin-dialog-field">
                <Label>会议室 / 地点</Label>
                <Select
                  value={form.roomId || 'NONE'}
                  onValueChange={value =>
                    setForm(prev => ({
                      ...prev,
                      roomId: value === 'NONE' ? undefined : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择会议室" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">暂不绑定会议室</SelectItem>
                    {meetingRooms.map(room => (
                      <SelectItem key={String(room.roomId)} value={String(room.roomId)}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {meetingRooms.length > 0 ? `当前可选 ${meetingRooms.length} 间会议室` : '当前没有可选会议室'}
                </div>
              </div>
            ) : (
              <div className="admin-dialog-value-note">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">会议室 / 地点</div>
                <div className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
                  非会议事项无需绑定会议室。
                </div>
              </div>
            )}
          </DialogPanel>

          <DialogPanel title="时间设置" description="全天事项会按整天保存，普通日程保留具体开始和结束时间" bodyClassName="grid gap-4">
            <label className="admin-dialog-checkline">
              <input
                type="checkbox"
                checked={Boolean(form.isAllDay)}
                onChange={event => handleAllDayToggle(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>全天事项</span>
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                开启后自动按整天保存时间范围
              </span>
            </label>

            {form.isAllDay ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="admin-dialog-field">
                  <Label>开始日期</Label>
                  <DatePicker
                    className="h-11"
                    type="date"
                    value={form.startTime ? toLocalDateString(form.startTime) : ''}
                    onChange={event =>
                      setForm(prev => ({
                        ...prev,
                        startTime: toDayBoundaryString(event.target.value, 'start'),
                      }))
                    }
                  />
                </div>
                <div className="admin-dialog-field">
                  <Label>结束日期</Label>
                  <DatePicker
                    className="h-11"
                    type="date"
                    value={form.endTime ? toLocalDateString(form.endTime) : ''}
                    onChange={event =>
                      setForm(prev => ({
                        ...prev,
                        endTime: toDayBoundaryString(event.target.value, 'end'),
                      }))
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="admin-dialog-field">
                  <Label className="flex items-center gap-2">
                    <Clock3 size={14} className="text-cyan-500" />
                    开始时间
                  </Label>
                  <DatePicker
                    className="h-11"
                    type="datetime-local"
                    value={form.startTime ? toLocalDatetimeString(form.startTime) : ''}
                    onChange={event =>
                      setForm(prev => ({
                        ...prev,
                        startTime: toBackendDateString(event.target.value),
                      }))
                    }
                  />
                </div>
                <div className="admin-dialog-field">
                  <Label className="flex items-center gap-2">
                    <Clock3 size={14} className="text-cyan-500" />
                    结束时间
                  </Label>
                  <DatePicker
                    className="h-11"
                    type="datetime-local"
                    value={form.endTime ? toLocalDatetimeString(form.endTime) : ''}
                    onChange={event =>
                      setForm(prev => ({
                        ...prev,
                        endTime: toBackendDateString(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {form.type === 'MEETING'
                ? `当前类型：会议预约${draftMeetingRoomLabel ? ` · ${draftMeetingRoomLabel}` : ''}`
                : '当前类型无需绑定会议室。'}
            </div>
          </DialogPanel>

          <DialogPanel title="备注说明" description="补充议程、目标、注意事项或提醒信息">
            <div className="admin-dialog-field">
              <Label className="flex items-center gap-2">
                <FileText size={14} />
                备注内容
              </Label>
              <Textarea
                placeholder="补充议程、目标、注意事项或提醒信息"
                className="min-h-[140px] resize-none"
                value={form.description || ''}
                onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
              />
            </div>
          </DialogPanel>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(selectedEvent)}
        title={selectedEvent?.title || '日程详情'}
        description={selectedEvent ? formatEventSlot(selectedEvent) : undefined}
        onClose={() => setSelectedEvent(null)}
        maxWidthClassName="max-w-2xl"
        panelClassName="max-h-[90vh]"
        bodyClassName="admin-dialog-stack max-h-[70vh] overflow-y-auto"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSelectedEvent(null)}>
              关闭
            </Button>
            <Button variant="destructive" onClick={handleDeleteSelectedEvent} disabled={isDeleting || !selectedEvent || !canDeleteSchedule}>
              <Trash2 size={16} className="mr-2" />
              {isDeleting ? '正在删除...' : '删除日程'}
            </Button>
          </div>
        }
      >
        {selectedEvent ? (
          <div className="admin-dialog-stack">
            <DialogPanel title="状态标签" description="当前类型和时间状态">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${EVENT_TYPE_META[selectedEvent.type].badgeClass}`}>
                  {EVENT_TYPE_META[selectedEvent.type].label}
                </span>
                {selectedEventTimingMeta ? (
                  <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${selectedEventTimingMeta.badgeClass}`}>
                    {selectedEventTimingMeta.label}
                  </span>
                ) : null}
              </div>
            </DialogPanel>

            <ScheduleDetailRows>
              <ScheduleDetailRow label="时间范围" value={formatEventSlot(selectedEvent)} />
              <ScheduleDetailRow
                label="预计占用"
                value={getDurationLabel(selectedEvent.startTime, selectedEvent.endTime, selectedEvent.allDay)}
              />
              <ScheduleDetailRow label="会议室 / 地点" value={getLocationLabel(selectedEvent.type, selectedEvent.roomName)} />
              <ScheduleDetailRow label="当前状态" value={selectedEventTimingMeta?.hint || '待开始'} />
            </ScheduleDetailRows>

            <DialogPanel title="备注说明">
              <div className="admin-dialog-value-note">
                {selectedEvent.description?.trim() || '暂无补充备注'}
              </div>
            </DialogPanel>
          </div>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除日程"
        message={pendingDelete ? `确认删除“${pendingDelete.title}”吗？删除后不可恢复。` : ''}
        danger
        confirmText={isDeleting ? '正在删除...' : '确认删除'}
        onCancel={() => {
          if (!isDeleting) setPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
};
