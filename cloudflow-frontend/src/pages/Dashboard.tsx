import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import {
  ArrowRight,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  Car,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock3,
  CloudSun,
  CreditCard,
  FileSearch,
  FileText,
  MailOpen,
  Megaphone,
  Moon,
  PlayCircle,
  Sparkles,
  Sun,
  Sunrise,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import request from '../services/api/request';

function extractTotal(response: unknown): number {
  if (response && typeof response === 'object') {
    const objectResponse = response as Record<string, unknown>;
    if (typeof objectResponse.total === 'number') {
      return objectResponse.total;
    }
  }
  return 0;
}

function extractNumberByKey(response: unknown, key: string): number {
  if (response && typeof response === 'object') {
    const objectResponse = response as Record<string, unknown>;
    const value = objectResponse[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return 0;
}

function extractRows(response: unknown): any[] {
  if (response && typeof response === 'object') {
    const objectResponse = response as Record<string, unknown>;
    if (Array.isArray(objectResponse.rows)) return objectResponse.rows;
    if (Array.isArray(objectResponse.records)) return objectResponse.records;
    if (Array.isArray(objectResponse.data)) return objectResponse.data;
    if (Array.isArray(response)) return response as any[];
  }
  return [];
}

function getGreetingInfo(): { text: string; icon: React.ReactNode } {
  const hour = new Date().getHours();
  if (hour < 6) return { text: '夜深了', icon: <Moon size={20} /> };
  if (hour < 9) return { text: '早上好', icon: <Sunrise size={20} /> };
  if (hour < 12) return { text: '上午好', icon: <Sun size={20} /> };
  if (hour < 14) return { text: '中午好', icon: <CloudSun size={20} /> };
  if (hour < 18) return { text: '下午好', icon: <Sun size={20} /> };
  if (hour < 22) return { text: '晚上好', icon: <Moon size={20} /> };
  return { text: '夜深了', icon: <Moon size={20} /> };
}

function formatDateCN(date: Date): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

function relTime(value: string): string {
  if (!value) return '';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}天前` : `${Math.floor(days / 7)}周前`;
}

function formatClock(value?: string): string {
  if (!value) return '';
  const match = value.match(/(\d{2}:\d{2})/);
  return match ? match[1] : value;
}

function formatScheduleRange(item: any): string {
  const start = formatClock(item.startTime);
  const end = formatClock(item.endTime);
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  return '全天安排';
}

const ListSkeleton = () => (
  <div className="space-y-3 p-4">
    {[1, 2, 3].map(index => (
      <div key={index} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white/70 px-4 py-3">
        <div className="h-10 w-10 shrink-0 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">{icon}</div>
    <div className="mt-4 text-sm font-semibold text-slate-700">{title}</div>
    <div className="mt-2 max-w-xs text-xs leading-6 text-slate-400">{description}</div>
  </div>
);

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

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [greeting, setGreeting] = useState(getGreetingInfo());
  const [dateStr, setDateStr] = useState(formatDateCN(new Date()));
  const [timeStr, setTimeStr] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [myAppsCount, setMyAppsCount] = useState(0);
  const [copyCount, setCopyCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('read_announcements');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [loadingTodo, setLoadingTodo] = useState(true);
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      setDateStr(formatDateCN(now));
      setGreeting(getGreetingInfo());
    };

    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const silentConfig = { silent: true };

    request
      .get('/workflow/todo', { params: { pageNum: 1, pageSize: 5 }, ...silentConfig })
      .then(response => {
        setPendingCount(extractTotal(response));
        setPendingTasks(extractRows(response).slice(0, 5));
      })
      .catch(() => {
        setPendingCount(0);
        setPendingTasks([]);
      })
      .finally(() => setLoadingTodo(false));

    request
      .get('/workflow/my-instances', { params: { pageNum: 1, pageSize: 5 }, ...silentConfig })
      .then(response => {
        setMyAppsCount(extractTotal(response));
        setRecentApps(extractRows(response).slice(0, 5));
      })
      .catch(() => {
        setMyAppsCount(0);
        setRecentApps([]);
      })
      .finally(() => setLoadingApps(false));

    request
      .get('/workflow/copy/list', { params: { pageNum: 1, pageSize: 5 }, ...silentConfig })
      .then(response => setCopyCount(extractTotal(response)))
      .catch(() => setCopyCount(0));

    request
      .get('/workflow/tasks/count', { ...silentConfig })
      .then(response => setDoneCount(extractNumberByKey(response, 'doneCount')))
      .catch(() => setDoneCount(0));

    request
      .get('/oa/announcement/my-list', { ...silentConfig })
      .then(response => setAnnouncements(extractRows(response).slice(0, 5)))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoadingAnnouncements(false));

    const today = new Date().toISOString().split('T')[0];
    request
      .get('/oa/schedule/my-events', { params: { start: today, end: today }, ...silentConfig })
      .then(response => setSchedules(extractRows(response).slice(0, 5)))
      .catch(() => setSchedules([]))
      .finally(() => setLoadingSchedule(false));
  }, [user]);

  if (!user) {
    return null;
  }

  const unreadAnnouncementCount = announcements.filter(item => !readAnnouncementIds.has(String(item.announcementId || item.id))).length;
  const completionRate = Math.round((doneCount / Math.max(doneCount + pendingCount, 1)) * 100);
  const greetingSummary =
    pendingCount > 0
      ? `你今天还有 ${pendingCount} 个流程等待处理，建议优先清理待办审批。`
      : '今天没有新的审批压力，可以把时间留给计划内工作与协同安排。';

  const metricCards = [
    {
      label: '待办审批',
      value: pendingCount,
      desc: '需要优先处理',
      path: '/tasks',
      icon: <ClipboardCheck size={20} />,
      iconClass: 'bg-pink-50 text-pink-600',
      ringClass: 'ring-pink-100',
    },
    {
      label: '我的申请',
      value: myAppsCount,
      desc: '已发起流程',
      path: '/my-apps',
      icon: <FileText size={20} />,
      iconClass: 'bg-slate-100 text-slate-600',
      ringClass: 'ring-slate-200',
    },
    {
      label: '抄送我的',
      value: copyCount,
      desc: '需要知悉的流程',
      path: '/my-copies',
      icon: <MailOpen size={20} />,
      iconClass: 'bg-amber-50 text-amber-600',
      ringClass: 'ring-amber-100',
    },
    {
      label: '已完成',
      value: doneCount,
      desc: '已审批完成',
      path: '/tasks',
      icon: <CheckCheck size={20} />,
      iconClass: 'bg-emerald-50 text-emerald-600',
      ringClass: 'ring-emerald-100',
    },
  ];

  const shortcuts = [
    { label: '发起流程', icon: <PlayCircle size={20} />, path: '/workplace', tone: 'bg-pink-50 text-pink-600' },
    { label: 'HR 工作台', icon: <Users size={20} />, path: '/hr/dashboard', tone: 'bg-rose-50 text-rose-600' },
    { label: '我的日程', icon: <CalendarDays size={20} />, path: '/schedule', tone: 'bg-amber-50 text-amber-600' },
    { label: '会议预约', icon: <Users size={20} />, path: '/meeting-room', tone: 'bg-pink-50 text-pink-600' },
    { label: '公告中心', icon: <Megaphone size={20} />, path: '/announcement', tone: 'bg-slate-100 text-slate-600' },
    { label: '报销申请', icon: <CreditCard size={20} />, path: '/expense/claim', tone: 'bg-amber-50 text-amber-600' },
    { label: '出差申请', icon: <Briefcase size={20} />, path: '/office/business-trip', tone: 'bg-rose-50 text-rose-600' },
    { label: '用车申请', icon: <Car size={20} />, path: '/admin/vehicle/booking', tone: 'bg-slate-100 text-slate-600' },
    { label: '考勤打卡', icon: <UserCheck size={20} />, path: '/admin/attendance/checkin', tone: 'bg-pink-50 text-pink-600' },
    { label: '加班申请', icon: <Timer size={20} />, path: '/office/overtime', tone: 'bg-amber-50 text-amber-600' },
    { label: '通讯录', icon: <Building2 size={20} />, path: '/office/contact', tone: 'bg-slate-100 text-slate-600' },
  ];

  const focusItems = [
    pendingCount > 0
      ? { label: '待办审批', value: `${pendingCount} 项`, hint: '建议优先处理最紧急的流程', path: '/tasks', tone: 'bg-pink-50 text-pink-600' }
      : null,
    schedules.length > 0
      ? { label: '今日日程', value: `${schedules.length} 项`, hint: '查看今天的会议与安排', path: '/schedule', tone: 'bg-amber-50 text-amber-600' }
      : null,
    unreadAnnouncementCount > 0
      ? { label: '公告通知', value: `${unreadAnnouncementCount} 条`, hint: '有新的公告待查看', path: '/announcement', tone: 'bg-rose-50 text-rose-600' }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; hint: string; path: string; tone: string }>;

  const statusMap: Record<string, { label: string; badgeClass: string }> = {
    PENDING: { label: '待审批', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
    RUNNING: { label: '进行中', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
    APPROVED: { label: '已通过', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    REJECTED: { label: '已驳回', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
    COMPLETED: { label: '已完成', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    CANCELLED: { label: '已取消', badgeClass: 'bg-slate-50 text-slate-600 border-slate-200' },
  };

  const renderStatusBadge = (status: string) => {
    const config = statusMap[status] || { label: status || '未知', badgeClass: 'bg-slate-50 text-slate-600 border-slate-200' };
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${config.badgeClass}`}>{config.label}</span>;
  };

  const markAnnouncementAsRead = (id: string) => {
    const nextSet = new Set(readAnnouncementIds);
    nextSet.add(id);
    setReadAnnouncementIds(nextSet);
    try {
      localStorage.setItem('read_announcements', JSON.stringify([...nextSet]));
    } catch {
      // ignore storage errors
    }
  };

  return (
    <div className="relative min-h-screen pb-6">
      <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
        <div className="absolute left-[-10%] top-[-8%] h-[32rem] w-[32rem] rounded-full bg-pink-300/18 blur-[120px]" />
        <div className="absolute right-[-12%] top-[12%] h-[38rem] w-[38rem] rounded-full bg-rose-200/20 blur-[140px]" />
        <div className="absolute bottom-[-12%] left-[18%] h-[26rem] w-[26rem] rounded-full bg-amber-100/45 blur-[110px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.55),rgba(255,255,255,0.8))]" />
      </div>

      <div className="relative z-10 space-y-6 px-1">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <Card className="overflow-hidden rounded-[34px] border-white/80 bg-white/78 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <div className="relative p-7 sm:p-8">
              <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_55%)]" />
              <div className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-pink-200/30 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-amber-100/55 blur-2xl" />

              <div className="relative">
                <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-pink-600 ring-1 ring-pink-100">
                    <Calendar size={14} />
                    {dateStr}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{timeStr}</span>
                  {user.deptName ? <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{user.deptName}</span> : null}
                </div>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
                      <Sparkles size={14} />
                      Workspace Overview
                    </div>
                    <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.85rem]">
                      {greeting.text}，{user.name}
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{greetingSummary}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="h-12 rounded-2xl bg-pink-500 px-6 text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)] hover:bg-pink-600"
                      onClick={() => navigate('/tasks')}
                    >
                      去处理
                      <ArrowRight size={16} className="ml-2" />
                    </Button>
                    <Button variant="outline" className="h-12 rounded-2xl bg-white/85 px-6" onClick={() => navigate('/workplace')}>
                      <PlayCircle size={16} className="mr-2 text-pink-500" />
                      发起流程
                    </Button>
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">审批状态</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{pendingCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">当前仍需处理的流程任务</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">今日安排</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{schedules.length}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">今天在日历中的事项数量</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">公告提醒</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{unreadAnnouncementCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">仍未查看的公告通知</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-[34px] border-white/80 bg-white/82 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.04)] backdrop-blur-xl">
            <SectionHeader eyebrow="Today Focus" title="今天先看这些" />
            <div className="mt-5 space-y-3">
              {focusItems.length > 0 ? (
                focusItems.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => navigate(item.path)}
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
                      <div className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</div>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState icon={<CheckCircle2 size={26} />} title="今天节奏平稳" description="当前没有高优先级提醒，你可以把时间用于计划内工作。" />
              )}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">我的申请</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{myAppsCount}</div>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">抄送我的</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{copyCount}</div>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">完成率</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{completionRate}%</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {metricCards.map(card => (
            <button key={card.label} type="button" onClick={() => navigate(card.path)} className="text-left">
              <Card className={`rounded-[28px] border-white/80 bg-white/78 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)] backdrop-blur-xl ring-1 ${card.ringClass} transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(15,23,42,0.08)]`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-500">{card.label}</div>
                    <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{card.value}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-400">{card.desc}</div>
                  </div>
                  <div className={`rounded-2xl p-3 ${card.iconClass}`}>{card.icon}</div>
                </div>
              </Card>
            </button>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Card className="rounded-[32px] border-white/80 bg-white/78 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <SectionHeader eyebrow="Priority Queue" title="优先待办" actionLabel="查看全部" onAction={() => navigate('/tasks')} />
              <div className="mt-5">
                {loadingTodo ? (
                  <ListSkeleton />
                ) : pendingTasks.length > 0 ? (
                  <div className="space-y-3">
                    {pendingTasks.map((task, index) => (
                      <button
                        key={task.id || index}
                        type="button"
                        onClick={() => navigate('/tasks')}
                        className="flex w-full items-center gap-4 rounded-[24px] border border-slate-100 bg-white px-4 py-4 text-left transition hover:border-pink-100 hover:bg-pink-50/25"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-sm font-bold text-pink-600">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{task.processName || task.title || task.instanceName || '审批任务'}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {task.startUserName || task.creatorName || '发起人未知'}
                            {task.createTime ? <span className="ml-2 text-slate-400">{relTime(task.createTime)}</span> : null}
                          </div>
                        </div>
                        {renderStatusBadge(task.status || 'PENDING')}
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<CheckCircle2 size={26} />} title="待办已清空" description="当前没有新的审批任务，继续保持这个节奏。" />
                )}
              </div>
            </Card>

            <Card className="rounded-[32px] border-white/80 bg-white/78 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <SectionHeader eyebrow="Recent Applications" title="最近申请" actionLabel="查看全部" onAction={() => navigate('/my-apps')} />
              <div className="mt-5">
                {loadingApps ? (
                  <ListSkeleton />
                ) : recentApps.length > 0 ? (
                  <div className="space-y-3">
                    {recentApps.map((item, index) => (
                      <button
                        key={item.id || index}
                        type="button"
                        onClick={() => navigate('/my-apps')}
                        className="flex w-full items-center gap-4 rounded-[24px] border border-slate-100 bg-white px-4 py-4 text-left transition hover:border-pink-100 hover:bg-pink-50/25"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                          <FileSearch size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{item.processName || item.title || item.instanceName || '流程申请'}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.createTime ? relTime(item.createTime) : '暂无时间信息'}</div>
                        </div>
                        {renderStatusBadge(item.status || 'RUNNING')}
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<FileText size={26} />} title="还没有新的申请记录" description="发起流程后，这里会展示你最近的审批进展。" />
                )}
              </div>
            </Card>

            <Card className="rounded-[32px] border-white/80 bg-white/78 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <SectionHeader eyebrow="Quick Launcher" title="快捷入口" />
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {shortcuts.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="group rounded-[26px] border border-slate-100 bg-white px-4 py-5 text-left transition hover:border-pink-100 hover:bg-pink-50/20 hover:shadow-[0_16px_30px_rgba(236,72,153,0.08)]"
                  >
                    <div className={`inline-flex rounded-2xl p-3 ${item.tone}`}>{item.icon}</div>
                    <div className="mt-4 text-sm font-semibold text-slate-900">{item.label}</div>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition group-hover:text-pink-600">
                      进入
                      <ChevronRight size={14} />
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[32px] border-white/80 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <SectionHeader eyebrow="Today Schedule" title="今日日程" actionLabel="查看日历" onAction={() => navigate('/schedule')} />
              <div className="mt-5">
                {loadingSchedule ? (
                  <ListSkeleton />
                ) : schedules.length > 0 ? (
                  <div className="space-y-3">
                    {schedules.map((item, index) => (
                      <button
                        key={item.id || index}
                        type="button"
                        onClick={() => navigate('/schedule')}
                        className="flex w-full items-start gap-3 rounded-[24px] border border-slate-100 bg-white px-4 py-4 text-left transition hover:border-amber-100 hover:bg-amber-50/25"
                      >
                        <div className="mt-0.5 rounded-2xl bg-amber-50 p-3 text-amber-600">
                          <CalendarDays size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{item.title || item.content || '日程'}</div>
                          <div className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                            <Clock3 size={12} />
                            {formatScheduleRange(item)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<CalendarDays size={26} />} title="今天没有新日程" description="你可以留出整块时间处理深度工作，或者回到日历提前安排。" />
                )}
              </div>
            </Card>

            <Card className="rounded-[32px] border-white/80 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <SectionHeader eyebrow="Announcement Center" title="公告通知" actionLabel="更多公告" onAction={() => navigate('/announcement')} />
              <div className="mt-5">
                {loadingAnnouncements ? (
                  <ListSkeleton />
                ) : announcements.length > 0 ? (
                  <div className="space-y-3">
                    {announcements.map((item, index) => {
                      const itemId = String(item.announcementId || item.id);
                      const isRead = readAnnouncementIds.has(itemId);
                      return (
                        <button
                          key={item.announcementId || item.id || index}
                          type="button"
                          onClick={() => {
                            if (!isRead) {
                              markAnnouncementAsRead(itemId);
                            }
                            navigate('/announcement');
                          }}
                          className={`flex w-full items-start gap-3 rounded-[24px] border px-4 py-4 text-left transition ${
                            isRead ? 'border-slate-100 bg-slate-50/70' : 'border-rose-100 bg-white hover:bg-rose-50/25'
                          }`}
                        >
                          <div className={`mt-0.5 rounded-2xl p-3 ${isRead ? 'bg-slate-100 text-slate-400' : 'bg-rose-50 text-rose-600'}`}>
                            <Bell size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-sm font-semibold ${isRead ? 'text-slate-500' : 'text-slate-900'}`}>{item.title || '公告通知'}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.createTime ? relTime(item.createTime) : '刚刚'}
                              {isRead ? <span className="ml-2 text-slate-400">已读</span> : <span className="ml-2 text-rose-500">未读</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={<Megaphone size={26} />} title="暂无公告通知" description="新公告发布后会第一时间出现在这里。" />
                )}
              </div>
            </Card>

            <Card className="rounded-[32px] border-white/80 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <SectionHeader eyebrow="Work Overview" title="工作概览" />
              <div className="mt-5 rounded-[28px] border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-white p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500">审批完成率</div>
                <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{completionRate}%</div>
                <div className="mt-2 text-sm leading-6 text-slate-500">已完成与待办审批的整体进度比例</div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-pink-100/80">
                  <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-500" style={{ width: `${completionRate}%` }} />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {[
                  { label: '待办审批', value: pendingCount },
                  { label: '我的申请', value: myAppsCount },
                  { label: '抄送我的', value: copyCount },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3">
                    <div className="text-sm font-medium text-slate-600">{item.label}</div>
                    <div className="text-lg font-bold tracking-tight text-slate-900">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4 text-xs leading-6 text-slate-500">
                当前桌面端已整合流程中心、公告、日程和 HR 入口，适合作为每日第一屏工作台。
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
