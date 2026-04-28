import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Clock3,
  Contact,
  FileClock,
  Megaphone,
  PlaneTakeoff,
  UserRound,
} from 'lucide-react';
import { LoadingSpinner } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getMyAnnouncements } from '@/services/api/announcement';
import { HrLeaveApplicationVO, listHrApprovedLeaveBoard } from '@/services/api/hr';
import { getMyEvents } from '@/services/api/schedule';
import { parseBackendDate } from '@/utils/dateFormat';
import type { Announcement, SysScheduleEvent } from '@/types';

const pad = (value: number) => String(value).padStart(2, '0');

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = parseBackendDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatLeavePeriod = (periodType?: string | null) => {
  switch (periodType) {
    case 'AM':
      return '上午';
    case 'PM':
      return '下午';
    case 'FULL_DAY':
      return '全天';
    default:
      return '休假';
  }
};

const getInitial = (name?: string | null) => (name?.trim().slice(0, 1) || '休');

const isSameLocalDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

const isLeaveOnDate = (leave: HrLeaveApplicationVO, date: Date) => {
  const start = parseBackendDate(leave.startTime);
  const end = parseBackendDate(leave.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  return start < nextDay && end >= dayStart;
};

const formatLeaveRange = (leave: HrLeaveApplicationVO) => {
  const start = parseBackendDate(leave.startTime);
  const end = parseBackendDate(leave.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '-';

  if (isSameLocalDate(start, end)) {
    return `${formatDateTime(leave.startTime).slice(0, 5)} ${formatLeavePeriod(leave.periodType)} · 至 ${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }

  return `${formatDateTime(leave.startTime)} 至 ${formatDateTime(leave.endTime)}`;
};

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [todayEvents, setTodayEvents] = useState<SysScheduleEvent[]>([]);
  const [leaveBoard, setLeaveBoard] = useState<HrLeaveApplicationVO[]>([]);
  const [loading, setLoading] = useState(true);

  const todayDate = useMemo(() => new Date(), []);
  const today = useMemo(() => formatLocalDate(todayDate), [todayDate]);
  const leaveBoardEndDate = useMemo(() => formatLocalDate(addDays(todayDate, 30)), [todayDate]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoading(true);

    void Promise.allSettled([
      getMyAnnouncements(),
      getMyEvents(today, today),
      listHrApprovedLeaveBoard({ startDate: today, endDate: leaveBoardEndDate }),
    ])
      .then(([announcementResult, eventResult, leaveBoardResult]) => {
        if (cancelled) return;
        setAnnouncements(
          announcementResult.status === 'fulfilled' && Array.isArray(announcementResult.value)
            ? announcementResult.value.slice(0, 5)
            : [],
        );
        setTodayEvents(
          eventResult.status === 'fulfilled' && Array.isArray(eventResult.value)
            ? eventResult.value.slice(0, 5)
            : [],
        );
        setLeaveBoard(
          leaveBoardResult.status === 'fulfilled' && Array.isArray(leaveBoardResult.value)
            ? leaveBoardResult.value.slice(0, 6)
            : [],
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [leaveBoardEndDate, today, user]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const quickActions = [
    { label: '休假登记', path: '/hr/leave/application', icon: FileClock },
    { label: '加班登记', path: '/hr/overtime/applications', icon: Clock3 },
    { label: '员工档案', path: '/hr/employees', icon: UserRound },
    { label: '通讯录', path: '/office/contact', icon: Contact },
  ];
  const todayLeaveCount = leaveBoard.filter((item) => isLeaveOnDate(item, todayDate)).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3 text-slate-500">
            <CalendarDays size={20} />
            <span className="text-sm">今日日程</span>
          </div>
          <div className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">
            {todayEvents.length}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3 text-slate-500">
            <Megaphone size={20} />
            <span className="text-sm">公告</span>
          </div>
          <div className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">
            {announcements.length}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3 text-slate-500">
            <PlaneTakeoff size={20} />
            <span className="text-sm">今日休假</span>
          </div>
          <div className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">
            {todayLeaveCount}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {quickActions.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/20"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">
              <item.icon size={20} />
            </span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {item.label}
            </span>
          </button>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.15fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">今日日程</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {todayEvents.length ? (
              todayEvents.map((item) => (
                <button
                  key={item.eventId}
                  type="button"
                  onClick={() => navigate('/schedule')}
                  className="block w-full px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60"
                >
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.startTime)}</div>
                </button>
              ))
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">今天暂无日程。</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-teal-100 bg-white shadow-sm dark:border-teal-950/60 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-teal-100 px-5 py-4 dark:border-teal-950/60">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">休假看板</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">今天起 30 天内已通过休假</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/hr/leave/application')}
              className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 transition hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200 dark:hover:bg-teal-950/50"
            >
              查看登记
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {leaveBoard.length ? (
              leaveBoard.map((item) => {
                const activeToday = isLeaveOnDate(item, todayDate);
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/30 dark:text-teal-200 dark:ring-teal-900">
                      {getInitial(item.employeeName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.employeeName || '未命名员工'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                          {item.leaveTypeName || '休假'}
                        </span>
                        {activeToday ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900">
                            休假中
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatLeaveRange(item)}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400">近期暂无已通过休假。</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">公告</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {announcements.length ? (
              announcements.map((item) => (
                <button
                  key={item.announcementId}
                  type="button"
                  onClick={() => navigate('/announcement')}
                  className="block w-full px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60"
                >
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDateTime(item.publishTime || item.createTime)}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">暂无公告。</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
