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
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { Pagination } from '@/components/common/Pagination';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '../context/AuthContext';
import { createEvent, deleteEvent, getMeetingRooms, getMyEvents } from '../services/api/schedule';
import type { MeetingRoom, SysScheduleEvent } from '../types';
import {
  parseBackendDate,
  toBackendDateString,
  toLocalDatetimeString,
  toQueryDateString,
} from '../utils/dateFormat';
import { cn } from '@/utils/cn';

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
    color: '#06b6d4',
    badgeClass: 'bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-200 dark:ring-cyan-900',
    softClass: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200',
    hint: '适合评审、同步和客户沟通等需要明确地点或固定时段的安排。',
  },
  WORK: {
    label: '工作',
    color: '#10b981',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900',
    softClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
    hint: '适合项目推进、交付节点和需要整块时间推进的任务。',
  },
  PERSONAL: {
    label: '个人',
    color: '#f59e0b',
    badgeClass: 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900',
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

// 统一计算日程在当前时间点的状态，供 Hero、表格和详情抽屉复用。
const getEventTimingMeta = (event: ScheduleEventLike, referenceDate: Date): EventTimingMeta => {
  const { start, end } = getEventTimeValues(event);

  if (!start || !end) {
    return {
      label: '时间异常',
      hint: '请检查开始时间和结束时间',
      badgeClass: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800',
    };
  }

  if (end.getTime() <= referenceDate.getTime()) {
    return {
      label: '已结束',
      hint: `结束于 ${start.toDateString() === end.toDateString() ? timeFormatter.format(end) : monthDayFormatter.format(end)}`,
      badgeClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
    };
  }

  if (start.getTime() <= referenceDate.getTime()) {
    if (event.allDay) {
      return {
        label: '全天进行中',
        hint: '当前日期整天占用',
        badgeClass: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900',
      };
    }

    return {
      label: '进行中',
      hint: `截至 ${timeFormatter.format(end)}`,
      badgeClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900',
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
      badgeClass: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:ring-sky-900',
    };
  }

  return {
    label: '待开始',
    hint: startHint,
    badgeClass: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:ring-sky-900',
  };
};

const SectionHeader = ({
  eyebrow,
  title,
  aside,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{eyebrow}</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</div>
    </div>
    <div className="flex items-center gap-2">
      {aside}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition hover:text-cyan-600 dark:text-slate-500 dark:hover:text-cyan-200"
        >
          {actionLabel}
          <ChevronRight size={14} />
        </button>
      ) : null}
    </div>
  </div>
);

const AsidePanel = ({
  eyebrow,
  title,
  count,
  meta,
  children,
}: {
  eyebrow: string;
  title: string;
  count?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Card className="rounded-2xl border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/88">
    <SectionHeader
      eyebrow={eyebrow}
      title={title}
      aside={
        count ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {count}
          </span>
        ) : undefined
      }
    />
    {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">{meta}</div> : null}
    <div className="mt-2.5 space-y-2">{children}</div>
  </Card>
);

const AsideEventButton = ({
  event,
  now,
  onOpen,
}: {
  event: ScheduleCalendarEvent;
  now: Date;
  onOpen: () => void;
}) => {
  const meta = EVENT_TYPE_META[event.extendedProps.type];
  const statusMeta = getEventTimingMeta(event, now);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-left transition hover:border-cyan-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-900 dark:hover:bg-slate-900/70"
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {event.extendedProps.originalTitle}
          </div>
          <div className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {event.allDay ? '全天' : timeFormatter.format(getSafeDate(event.extendedProps.startTime) ?? now)}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          <span className={`rounded-full px-2 py-1 font-semibold ${meta.badgeClass}`}>{meta.label}</span>
          <span className={`rounded-full px-2 py-1 font-semibold ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
        </div>
      </div>
    </button>
  );
};

const DrawerSection = ({
  eyebrow,
  title,
  description,
  children,
  className,
  bodyClassName,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section
    className={cn(
      'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88',
      className,
    )}
  >
    <div className="border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
        {eyebrow}
      </div>
      <div className="mt-1.5 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</div>
      {description ? (
        <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
      ) : null}
    </div>
    <div className={cn('px-4 py-4', bodyClassName)}>{children}</div>
  </section>
);

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
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
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
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : icon || <Calendar className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const ModalIconButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
    aria-label={label}
    title={label}
  >
    {children}
  </button>
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
  const [tableFilterDraft, setTableFilterDraft] = useState<ScheduleTableFilters>(DEFAULT_TABLE_FILTERS);
  const [tableFilters, setTableFilters] = useState<ScheduleTableFilters>(DEFAULT_TABLE_FILTERS);
  const [tablePageNum, setTablePageNum] = useState(1);

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

  const applyTableFilters = () => {
    const nextFilters = {
      ...tableFilterDraft,
      keyword: tableFilterDraft.keyword.trim(),
    };
    setTableFilterDraft(nextFilters);
    setTableFilters(nextFilters);
    setTablePageNum(1);
  };

  const handleResetTableFilters = () => {
    setTableFilterDraft(DEFAULT_TABLE_FILTERS);
    setTableFilters(DEFAULT_TABLE_FILTERS);
    setTablePageNum(1);
  };

  const handleTableTypeChange = (value: string) => {
    const nextType = (value || 'ALL') as ScheduleTypeFilter;
    setTableFilterDraft(prev => ({ ...prev, type: nextType }));
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
  const handleDeleteSelectedEvent = async () => {
    if (!selectedEvent) return;
    setIsDeleting(true);
    try {
      await deleteEvent(selectedEvent.id);
      toast.success('日程已删除');
      setSelectedEvent(null);
      await refreshCurrentWindow();
    } catch (error) {
      console.error('删除日程失败', error);
      toast.error('删除失败，请稍后重试');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteFromTable = async (event: ScheduleCalendarEvent) => {
    if (!window.confirm(`确认删除“${event.extendedProps.originalTitle}”吗？删除后不可恢复。`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteEvent(event.id);
      toast.success('日程已删除');
      if (selectedEvent?.id === event.id) {
        setSelectedEvent(null);
      }
      await refreshCurrentWindow();
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
  const todayFocusEvent =
    sortEventsByStart(
      todayEvents.filter(event => {
        const end = getSafeDate(event.extendedProps.endTime);
        return end ? end.getTime() >= now.getTime() : false;
      }),
    )[0] ?? todayEvents[0] ?? null;
  const nextFocusEvent = nextStartingEvents[0] ?? null;
  const todayAllDayCount = todayEvents.filter(event => event.allDay).length;
  const todayMeetingCount = todayEvents.filter(event => event.extendedProps.type === 'MEETING').length;
  const todayOngoingCount = ongoingEvents.filter(event => isEventOnDay(event, now)).length;
  const meetingEventsCount = events.filter(event => event.extendedProps.type === 'MEETING').length;
  const next24HourBoundary = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const next24HourEventsCount = nextStartingEvents.filter(event => {
    const start = getSafeDate(event.extendedProps.startTime);
    return start ? start.getTime() <= next24HourBoundary.getTime() : false;
  }).length;
  const nextAllDayCount = nextStartingEvents.filter(event => event.allDay).length;

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
  const activeFilterSummaries = [
    tableFilters.type !== 'ALL' ? `类型：${tableTypeLabel}` : null,
    tableFilters.scope !== 'ALL' ? `范围：${tableScopeLabel}` : null,
    tableFilters.keyword ? `关键词：${tableFilters.keyword}` : null,
  ].filter(Boolean) as string[];

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
  const scheduleSummary = nextFocusEvent
    ? `接下来：${nextFocusEvent.extendedProps.originalTitle}`
    : todayFocusEvent
      ? `今天重点：${todayFocusEvent.extendedProps.originalTitle}`
      : '按月、周、日视图统一查看个人安排。';
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
  const nextFocusTimingMeta = nextFocusEvent ? getEventTimingMeta(nextFocusEvent, now) : null;
  const selectedEventTimingMeta = selectedEvent ? getEventTimingMeta(selectedEvent, now) : null;
  const calendarToolbarSummary = nextFocusEvent
    ? `${nextFocusTimingMeta?.hint || '待开始'} · ${getEventLocationLabel(nextFocusEvent)}`
    : calendarWindowLabel || currentViewLabel;
  const typeBreakdownItems = (['MEETING', 'WORK', 'PERSONAL'] as ScheduleEventType[]).map(type => {
    const count = events.filter(event => event.extendedProps.type === type).length;
    const ratio = events.length > 0 ? Math.round((count / events.length) * 100) : 0;

    return {
      type,
      count,
      ratio,
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <Calendar className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
            My Schedule
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            我的日程
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {scheduleSummary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
            {shortDateFormatter.format(now)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950">
            {currentViewLabel}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950">
            {calendarWindowLabel || '当前时间窗口'}
          </span>
        </div>
      </div>

      <TablePageLayout
        className="gap-4"
        actions={
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              当前窗口 {events.length} 项
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              今日日程 {todayEvents.length} 项
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              进行中 {ongoingEvents.length} 项
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              会议安排 {meetingEventsCount} 项
            </span>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openCreateDrawer()}>
                <Plus size={14} className="mr-1.5" />
                新建日程
              </Button>
              <Button variant="outline" size="sm" onClick={() => calendarRef.current?.getApi().today()}>
                <Calendar size={14} className="mr-1.5" />
                回到今天
              </Button>
            </div>
          </div>
        }
        filters={
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="按标题、备注或会议室搜索"
                value={tableFilterDraft.keyword}
                onChange={event => setTableFilterDraft(prev => ({ ...prev, keyword: event.target.value }))}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    applyTableFilters();
                  }
                }}
                className="h-10 pl-10 pr-4"
              />
            </div>
            <div className="w-full sm:w-[180px]">
              <Select value={tableFilterDraft.scope} onValueChange={value => setTableFilterDraft(prev => ({ ...prev, scope: value as ScheduleFilterScope }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="请选择时间范围" />
                </SelectTrigger>
                <SelectContent>
                  {TABLE_FILTER_SCOPE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
              {VIEW_OPTIONS.map(option => {
                const active = option.value === calendarViewMode;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => calendarRef.current?.getApi().changeView(option.value)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      active
                        ? 'bg-white text-cyan-700 shadow-sm dark:bg-slate-950 dark:text-cyan-200'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <Button onClick={applyTableFilters}>
              <Search size={15} className="mr-2" />
              应用筛选
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetTableFilters}>
              <RotateCcw size={14} className="mr-2" />
              清空条件
            </Button>
          </div>
        }
        table={
          <div className="grid min-h-[46rem] xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="border-b border-slate-200 dark:border-slate-800 xl:border-b-0 xl:border-r">
              <div className="space-y-4 p-4 sm:p-5">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">日程列表</div>
                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">主题、时间与地点</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {tableHasActiveFilters ? (
                          activeFilterSummaries.map(item => (
                            <span key={item} className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-200">
                              {item}
                            </span>
                          ))
                        ) : (
                          <>
                            <span>{calendarTitle || '当前视图'}</span>
                            <span>·</span>
                            <span>{calendarWindowLabel || currentViewLabel}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table className="min-w-[1120px]">
                      <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                        <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                          <TableHead>日程主题</TableHead>
                          <TableHead>节奏状态</TableHead>
                          <TableHead>时间安排</TableHead>
                          <TableHead>时长</TableHead>
                          <TableHead>会议室 / 地点</TableHead>
                          <TableHead>备注摘要</TableHead>
                          <TableActionHead className="w-56 text-right">当前操作</TableActionHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {isLoadingEvents ? (
                          <TableStateRow colSpan={7} title="正在同步日程列表..." loading />
                        ) : tablePageEvents.length === 0 ? (
                          <TableStateRow
                            colSpan={7}
                            icon={<Calendar size={18} />}
                            title={tableHasActiveFilters ? '当前条件下暂无匹配日程' : '当前视图暂无日程记录'}
                            description={
                              tableHasActiveFilters
                                ? '可以尝试切换类型、时间范围，或清空关键词后重新查看。'
                                : '在日历上创建新的安排后，这里会同步展示为可翻页的日程列表。'
                            }
                          />
                        ) : (
                          tablePageEvents.map(event => {
                            const meta = EVENT_TYPE_META[event.extendedProps.type];
                            const description = event.extendedProps.description?.trim() || '暂无补充说明';
                            const statusMeta = getEventTimingMeta(event, now);
                            const startDate = getSafeDate(event.extendedProps.startTime);

                            return (
                              <TableRow key={event.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/70">
                                <TableCell className="py-4">
                                  <div className="flex items-start gap-3">
                                    <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                          {event.extendedProps.originalTitle}
                                        </div>
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>
                                          {meta.label}
                                        </span>
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                                        <span>{event.allDay ? '全天模式' : `${timeFormatter.format(startDate ?? now)} 开始`}</span>
                                        <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                                        <span>{statusMeta.hint}</span>
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="inline-flex flex-col items-start gap-1.5">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.badgeClass}`}>
                                      {statusMeta.label}
                                    </span>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{statusMeta.hint}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                                  <div className="font-medium text-slate-700 dark:text-slate-200">{formatEventSlot(event)}</div>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                    {getDurationLabel(event.extendedProps.startTime, event.extendedProps.endTime, event.allDay)}
                                  </div>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                    <MapPin size={14} className="text-slate-400 dark:text-slate-500" />
                                    <span>{getEventLocationLabel(event)}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[18rem] py-4 text-sm text-slate-600 dark:text-slate-300">
                                  <div className="line-clamp-2 leading-6">{description === '暂无补充说明' ? '-' : description}</div>
                                </TableCell>
                                <TableCell className="whitespace-nowrap py-4 text-right">
                                  <TableRowActions
                                    align="end"
                                    className="gap-1"
                                    actions={[
                                      { label: '详情', icon: <Eye size={14} />, onClick: () => openEventDetail(event), tone: 'neutral' },
                                      { label: '删除', icon: <Trash2 size={14} />, onClick: () => void handleDeleteFromTable(event), disabled: isDeleting, tone: 'danger' },
                                    ]}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {tableTotal > 0 ? (
                    <Pagination
                      total={tableTotal}
                      page={tablePageNum}
                      pageSize={TABLE_PAGE_SIZE}
                      showPageSizeSelector={false}
                      showJump={false}
                      onPageChange={setTablePageNum}
                      onPageSizeChange={() => {}}
                    />
                  ) : null}
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">日历画布</div>
                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{loadError || calendarToolbarSummary}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {(['MEETING', 'WORK', 'PERSONAL'] as ScheduleEventType[]).map(type => (
                          <span key={type} className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${EVENT_TYPE_META[type].badgeClass}`}>
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EVENT_TYPE_META[type].color }} />
                            {EVENT_TYPE_META[type].label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          {calendarTitle || currentViewLabel}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                          {calendarWindowLabel || currentViewLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                          <button
                            type="button"
                            onClick={() => calendarRef.current?.getApi().prev()}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-950 dark:hover:text-slate-200"
                            aria-label="上一周期"
                            title="上一周期"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => calendarRef.current?.getApi().next()}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-950 dark:hover:text-slate-200"
                            aria-label="下一周期"
                            title="下一周期"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => calendarRef.current?.getApi().today()}>今天</Button>
                      </div>
                    </div>
                  </div>
                  <div className="schedule-calendar relative h-[720px] p-4 md:h-[760px] xl:h-[820px]">
              <style>{`
                .schedule-calendar .fc { height: 100%; color: #0f172a; }
                .dark .schedule-calendar .fc { color: #e2e8f0; }
                .schedule-calendar .fc-header-toolbar { display: none !important; }
                .schedule-calendar .fc-scrollgrid,
                .schedule-calendar .fc-theme-standard .fc-scrollgrid {
                  border-radius: 24px;
                  overflow: hidden;
                  border: 1px solid rgba(226, 232, 240, 0.95);
                  background:
                    radial-gradient(circle at top right, rgba(207, 250, 254, 0.88), transparent 35%),
                    radial-gradient(circle at top left, rgba(220, 252, 231, 0.5), transparent 30%),
                    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
                }
                .dark .schedule-calendar .fc-scrollgrid,
                .dark .schedule-calendar .fc-theme-standard .fc-scrollgrid {
                  border-color: rgba(30, 41, 59, 0.96);
                  background:
                    radial-gradient(circle at top right, rgba(8, 145, 178, 0.22), transparent 35%),
                    radial-gradient(circle at top left, rgba(16, 185, 129, 0.16), transparent 30%),
                    linear-gradient(180deg, rgba(2, 6, 23, 0.96) 0%, rgba(15, 23, 42, 0.98) 100%);
                }
                .schedule-calendar .fc-daygrid-day-frame {
                  min-height: 118px;
                  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.84) 100%);
                }
                .dark .schedule-calendar .fc-daygrid-day-frame {
                  background: linear-gradient(180deg, rgba(2, 6, 23, 0.96) 0%, rgba(15, 23, 42, 0.88) 100%);
                }
                .schedule-calendar .fc-day-today .fc-daygrid-day-frame,
                .schedule-calendar .fc-day-today .fc-timegrid-col-frame {
                  background:
                    radial-gradient(circle at top, rgba(207, 250, 254, 0.9), transparent 52%),
                    linear-gradient(180deg, rgba(240, 253, 250, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%);
                }
                .dark .schedule-calendar .fc-day-today .fc-daygrid-day-frame,
                .dark .schedule-calendar .fc-day-today .fc-timegrid-col-frame {
                  background:
                    radial-gradient(circle at top, rgba(8, 145, 178, 0.24), transparent 52%),
                    linear-gradient(180deg, rgba(15, 23, 42, 0.96) 0%, rgba(2, 6, 23, 0.94) 100%);
                }
                .schedule-calendar .fc-daygrid-day-number,
                .schedule-calendar .fc-col-header-cell-cushion {
                  margin: 0.45rem 0.55rem 0 0;
                  border-radius: 999px;
                  padding: 0.2rem 0.55rem;
                  font-size: 0.82rem;
                  font-weight: 700;
                  color: #334155;
                }
                .dark .schedule-calendar .fc-daygrid-day-number,
                .dark .schedule-calendar .fc-col-header-cell-cushion {
                  color: #cbd5e1;
                }
                .schedule-calendar .fc-day-today .fc-daygrid-day-number {
                  background: #0891b2;
                  color: #fff;
                  box-shadow: 0 8px 16px rgba(8, 145, 178, 0.28);
                }
                .schedule-calendar .fc-day-other .fc-daygrid-day-number {
                  color: #94a3b8;
                }
                .dark .schedule-calendar .fc-day-other .fc-daygrid-day-number {
                  color: #64748b;
                }
                .schedule-calendar .fc-timegrid-slot,
                .schedule-calendar .fc-daygrid-day,
                .schedule-calendar .fc-col-header-cell {
                  border-color: rgba(226, 232, 240, 0.95);
                }
                .dark .schedule-calendar .fc-timegrid-slot,
                .dark .schedule-calendar .fc-daygrid-day,
                .dark .schedule-calendar .fc-col-header-cell {
                  border-color: rgba(30, 41, 59, 0.95);
                }
                .schedule-calendar .fc-event {
                  cursor: pointer;
                  border: none !important;
                  border-radius: 14px !important;
                  box-shadow: 0 10px 24px -16px rgba(15, 23, 42, 0.65);
                }
                .schedule-calendar .fc-event-main { padding: 0 !important; }
                .dark .schedule-calendar .fc-timegrid-axis,
                .dark .schedule-calendar .fc-timegrid-slot-label-cushion {
                  color: #94a3b8;
                }
              `}</style>
              {isLoadingEvents && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-950/80"><div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">正在同步日程...</div></div>}
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
                  const title = eventInfo.event.extendedProps.originalTitle || eventInfo.event.title;
                  const roomName = eventInfo.event.extendedProps.roomName as string | undefined;
                  if (eventInfo.view.type === 'dayGridMonth') {
                    return <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-white"><span className="h-2 w-2 rounded-full bg-white/60" />{eventInfo.timeText ? <span className="shrink-0 text-white/80">{eventInfo.timeText}</span> : null}<span className="truncate">{title}</span></div>;
                  }
                  return <div className="space-y-1 px-2.5 py-2 text-white"><div className="text-[11px] font-medium text-white/80">{eventInfo.timeText || EVENT_TYPE_META[type].label}</div><div className="text-sm font-semibold leading-5">{title}</div>{roomName ? <div className="flex items-center gap-1 text-[11px] text-white/80"><MapPin size={11} /><span className="truncate">{roomName}</span></div> : null}</div>;
                }}
              />
                  </div>
                </div>
              </div>
            </section>

            <aside className="p-4 sm:p-5">
              <div className="space-y-4">
                <AsidePanel
                  eyebrow="今日安排"
                  title="今日日程"
                  count={`${todayEvents.length} 项`}
                  meta={
                    <>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">全天 {todayAllDayCount}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">进行中 {todayOngoingCount}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">会议 {todayMeetingCount}</span>
                    </>
                  }
                >
                  {todayEvents.length === 0 ? (
                    <InlineState title="今天暂时没有安排" className="py-6" />
                  ) : (
                    todayEvents.slice(0, 4).map(event => (
                      <AsideEventButton
                        key={event.id}
                        event={event}
                        now={now}
                        onOpen={() => openEventDetail(event)}
                      />
                    ))
                  )}
                </AsidePanel>

                <AsidePanel
                  eyebrow="即将开始"
                  title="接下来要关注"
                  count={`${nextStartingEvents.length} 项`}
                  meta={
                    <>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">24 小时内 {next24HourEventsCount}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">全天 {nextAllDayCount}</span>
                    </>
                  }
                >
                  {nextStartingEvents.length === 0 ? (
                    <InlineState title="当前没有即将开始的安排" className="py-6" />
                  ) : (
                    nextStartingEvents.slice(0, 4).map(event => (
                      <AsideEventButton
                        key={event.id}
                        event={event}
                        now={now}
                        onOpen={() => openEventDetail(event)}
                      />
                    ))
                  )}
                </AsidePanel>

                <AsidePanel eyebrow="类型拆分" title="日程类型">
                  {typeBreakdownItems.map(item => (
                    <div key={item.type} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EVENT_TYPE_META[item.type].color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{EVENT_TYPE_META[item.type].label}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${EVENT_TYPE_META[item.type].badgeClass}`}>{item.count}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${item.ratio}%`, backgroundColor: EVENT_TYPE_META[item.type].color }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </AsidePanel>
              </div>
            </aside>
          </div>
        }
      />
      {isCreateDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[3px]" onClick={closeCreateDrawer} />
          <div className="absolute inset-y-0 right-0 flex max-w-full">
            <div className="relative w-screen max-w-[420px]">
              <div className="flex h-full flex-col bg-white shadow-[0_30px_60px_rgba(15,23,42,0.16)] dark:bg-slate-950 dark:shadow-[0_34px_68px_rgba(2,6,23,0.6)]">
                <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        <Plus size={14} />
                        新建日程
                      </div>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">创建新的日程安排</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
                          {selectionSummary}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 font-semibold ${EVENT_TYPE_META[form.type || 'PERSONAL'].badgeClass}`}>
                          {EVENT_TYPE_META[form.type || 'PERSONAL'].label}
                        </span>
                      </div>
                    </div>
                    <ModalIconButton label="关闭新建抽屉" onClick={closeCreateDrawer}>
                      <X size={18} />
                    </ModalIconButton>
                  </div>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto bg-white px-6 py-6 dark:bg-slate-950">
                  <DrawerSection
                    eyebrow="安排概览"
                    title="先确认这次安排"
                    className="border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70"
                    bodyClassName="space-y-3"
                  >
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                        当前时间
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {draftSchedulePreview}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${EVENT_TYPE_META[form.type || 'PERSONAL'].badgeClass}`}
                      >
                        {EVENT_TYPE_META[form.type || 'PERSONAL'].label}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        {form.isAllDay ? '全天事项' : '时段安排'}
                      </span>
                      {form.type === 'MEETING' ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                          {draftMeetingRoomLabel || '未绑定会议室'}
                        </span>
                      ) : null}
                    </div>
                  </DrawerSection>

                  <DrawerSection
                    eyebrow="基础信息"
                    title="填写基本内容"
                    bodyClassName="space-y-5"
                  >
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">日程主题</Label>
                      <Input
                        type="text"
                        placeholder="例如：项目评审、客户回访、个人学习"
                        className="h-12 rounded-xl"
                        value={form.title || ''}
                        onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">日程类型</Label>
                        <Select value={form.type || 'PERSONAL'} onValueChange={handleFormTypeChange}>
                          <SelectTrigger className="h-12 rounded-xl">
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
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">会议室 / 地点</Label>
                          <Select
                            value={form.roomId || 'NONE'}
                            onValueChange={value =>
                              setForm(prev => ({
                                ...prev,
                                roomId: value === 'NONE' ? undefined : value,
                              }))
                            }
                          >
                            <SelectTrigger className="h-12 rounded-xl">
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
                            {meetingRooms.length > 0
                              ? `可选 ${meetingRooms.length} 间会议室`
                              : '当前没有可选会议室'}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">地点绑定</div>
                          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                            非会议事项无需绑定
                          </div>
                        </div>
                      )}
                    </div>
                  </DrawerSection>

                  <DrawerSection
                    eyebrow="时间设置"
                    title="安排时间范围"
                    bodyClassName="space-y-4"
                  >
                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-cyan-200 hover:bg-cyan-50">
                      <input
                        type="checkbox"
                        checked={Boolean(form.isAllDay)}
                        onChange={event => handleAllDayToggle(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-700">全天事项</div>
                        <div className="mt-1 text-xs text-slate-500">
                          自动按整天保存
                        </div>
                      </div>
                    </label>

                    {form.isAllDay ? (
                      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">开始日期</Label>
                          <DatePicker
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
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">结束日期</Label>
                          <DatePicker
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
                        <div className="text-xs text-amber-700 dark:text-amber-200">
                          如需精确到小时，关闭全天事项后重新选择时间。
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                            <Clock3 size={14} className="text-cyan-500" />
                            开始时间
                          </Label>
                          <DatePicker
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
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                            <Clock3 size={14} className="text-cyan-500" />
                            结束时间
                          </Label>
                          <DatePicker
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
                  </DrawerSection>

                  <DrawerSection
                    eyebrow="备注信息"
                    title="补充说明"
                  >
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <FileText size={14} />
                        备注说明
                      </Label>
                      <Textarea
                        placeholder="补充议程、目标、注意事项或提醒信息"
                        className="min-h-[140px] rounded-xl resize-none"
                        value={form.description || ''}
                        onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
                      />
                    </div>
                  </DrawerSection>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-6 py-5 dark:border-slate-800">
                  <Button variant="outline" size="xl" onClick={closeCreateDrawer}>取消</Button>
                  <Button size="xl" onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? '正在创建...' : '创建日程'}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[3px]" onClick={() => setSelectedEvent(null)} />
          <div className="absolute inset-y-0 right-0 flex max-w-full">
            <div className="relative w-screen max-w-[400px]">
              <div className="flex h-full flex-col bg-white shadow-[0_30px_60px_rgba(15,23,42,0.16)] dark:bg-slate-950 dark:shadow-[0_34px_68px_rgba(2,6,23,0.6)]">
                <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${EVENT_TYPE_META[selectedEvent.type].badgeClass}`}>{EVENT_TYPE_META[selectedEvent.type].label}</span>
                        {selectedEventTimingMeta ? (
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selectedEventTimingMeta.badgeClass}`}>
                            {selectedEventTimingMeta.label}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{selectedEvent.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
                          {formatEventSlot(selectedEvent)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
                          {getDurationLabel(selectedEvent.startTime, selectedEvent.endTime, selectedEvent.allDay)}
                        </span>
                      </div>
                    </div>
                    <ModalIconButton label="关闭详情抽屉" onClick={() => setSelectedEvent(null)}>
                      <X size={18} />
                    </ModalIconButton>
                  </div>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto bg-white px-6 py-6 dark:bg-slate-950">
                  <DrawerSection
                    eyebrow="时间概览"
                    title="当前安排状态"
                    className="border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70"
                    bodyClassName="grid gap-3 sm:grid-cols-2"
                  >
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                        时间范围
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
                        {formatEventSlot(selectedEvent)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                        预计占用
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
                        {getDurationLabel(selectedEvent.startTime, selectedEvent.endTime, selectedEvent.allDay)}
                      </div>
                    </div>
                  </DrawerSection>

                  <DrawerSection
                    eyebrow="安排信息"
                    title="关键信息"
                    bodyClassName="space-y-3"
                  >
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <MapPin size={14} className="text-slate-500 dark:text-slate-400" />
                        会议室 / 地点
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {getLocationLabel(selectedEvent.type, selectedEvent.roomName)}
                      </div>
                    </div>
                  </DrawerSection>

                  <DrawerSection
                    eyebrow="备注信息"
                    title="补充说明"
                  >
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                      {selectedEvent.description?.trim() || '暂无补充备注'}
                    </div>
                  </DrawerSection>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-6 py-5 dark:border-slate-800">
                  <Button variant="outline" size="xl" onClick={() => setSelectedEvent(null)}>关闭</Button>
                  <Button variant="destructive" size="xl" onClick={handleDeleteSelectedEvent} disabled={isDeleting}><Trash2 size={16} className="mr-2" />{isDeleting ? '正在删除...' : '删除日程'}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
