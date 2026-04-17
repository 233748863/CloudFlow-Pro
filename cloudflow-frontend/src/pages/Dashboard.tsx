import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import {
  ArrowRight,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  MailOpen,
  Megaphone,
  Moon,
  PlayCircle,
  Sun,
  Sunrise,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import request from '../services/api/request';
import { WorkspaceBackdrop, WorkspaceEmptyPanel } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';

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
  if (hour < 6) return { text: '凌晨好', icon: <Moon size={18} /> };
  if (hour < 9) return { text: '早上好', icon: <Sunrise size={18} /> };
  if (hour < 12) return { text: '上午好', icon: <Sun size={18} /> };
  if (hour < 18) return { text: '下午好', icon: <Sun size={18} /> };
  return { text: '晚上好', icon: <Moon size={18} /> };
}

function formatDateCN(date: Date): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

function relTime(value: string): string {
  if (!value) return '';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} 天前` : `${Math.floor(days / 7)} 周前`;
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
  <div className="space-y-3">
    {[1, 2, 3].map((index) => (
      <div
        key={index}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
      >
        <div className="h-10 w-10 shrink-0 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => <WorkspaceEmptyPanel variant="glass" icon={icon} title={title} description={description} />;

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
      .then((response) => {
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
      .then((response) => {
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
      .then((response) => setCopyCount(extractTotal(response)))
      .catch(() => setCopyCount(0));

    request
      .get('/workflow/tasks/count', { ...silentConfig })
      .then((response) => setDoneCount(extractNumberByKey(response, 'doneCount')))
      .catch(() => setDoneCount(0));

    request
      .get('/oa/announcement/my-list', { ...silentConfig })
      .then((response) => setAnnouncements(extractRows(response).slice(0, 5)))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoadingAnnouncements(false));

    const today = new Date().toISOString().split('T')[0];
    request
      .get('/oa/schedule/my-events', { params: { start: today, end: today }, ...silentConfig })
      .then((response) => setSchedules(extractRows(response).slice(0, 5)))
      .catch(() => setSchedules([]))
      .finally(() => setLoadingSchedule(false));
  }, [user]);

  const unreadAnnouncementCount = useMemo(
    () =>
      announcements.filter(
        (item) => !readAnnouncementIds.has(String(item.announcementId || item.id)),
      ).length,
    [announcements, readAnnouncementIds],
  );

  const completionRate = Math.round((doneCount / Math.max(doneCount + pendingCount, 1)) * 100);
  const greetingSummary =
    pendingCount > 0
      ? `今天还有 ${pendingCount} 个待处理事项，建议优先清理审批和日程提醒。`
      : '今天没有新的待办压力，可以从公告、日程和流程入口开始安排工作。';

  const metricCards = [
    {
      label: '待办审批',
      value: pendingCount,
      hint: '需要优先处理',
      path: '/tasks',
      icon: <ClipboardCheck size={18} />,
      iconClass: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: '我的申请',
      value: myAppsCount,
      hint: '已发起流程',
      path: '/my-apps',
      icon: <FileText size={18} />,
      iconClass: 'bg-slate-100 text-slate-600',
    },
    {
      label: '抄送我的',
      value: copyCount,
      hint: '待查看消息',
      path: '/my-copies',
      icon: <MailOpen size={18} />,
      iconClass: 'bg-amber-50 text-amber-600',
    },
    {
      label: '已完成',
      value: doneCount,
      hint: '今日处理结果',
      path: '/tasks',
      icon: <CheckCircle2 size={18} />,
      iconClass: 'bg-cyan-50 text-cyan-600',
    },
  ];

  const quickActions = [
    { label: '发起流程', icon: <PlayCircle size={18} />, path: '/workplace', tone: 'bg-emerald-50 text-emerald-600' },
    { label: '我的日程', icon: <CalendarDays size={18} />, path: '/schedule', tone: 'bg-amber-50 text-amber-600' },
    { label: '公告中心', icon: <Megaphone size={18} />, path: '/announcement', tone: 'bg-cyan-50 text-cyan-600' },
    { label: '会议预约', icon: <Users size={18} />, path: '/meeting-room', tone: 'bg-slate-100 text-slate-600' },
    { label: '报销申请', icon: <CreditCard size={18} />, path: '/expense/claim', tone: 'bg-amber-50 text-amber-600' },
    { label: '出差申请', icon: <Briefcase size={18} />, path: '/office/business-trip', tone: 'bg-cyan-50 text-cyan-600' },
    { label: '用车申请', icon: <Car size={18} />, path: '/admin/vehicle/booking', tone: 'bg-slate-100 text-slate-600' },
    { label: '考勤打卡', icon: <UserCheck size={18} />, path: '/hr/attendance/checkin', tone: 'bg-emerald-50 text-emerald-600' },
  ];

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

  if (!user) {
    return null;
  }

  return (
    <div className="relative min-h-full pb-3 xl:pb-4">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3.5 p-3.5 xl:space-y-4 xl:p-4">
        <WorkspaceHeroCard
          badge={
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
              <span className="text-emerald-600">{greeting.icon}</span>
              <span>{dateStr}</span>
              <span className="text-slate-300">|</span>
              <span>{timeStr}</span>
            </div>
          }
          title={`${greeting.text}，${user.name}`}
          description={greetingSummary}
          actions={
            <>
              <Button onClick={() => navigate('/tasks')}>
                处理待办
                <ArrowRight size={16} />
              </Button>
              <Button variant="outline" onClick={() => navigate('/workplace')}>
                <PlayCircle size={16} />
                发起流程
              </Button>
            </>
          }
        >
          <div className="grid gap-3 xl:grid-cols-4">
            {metricCards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={() => navigate(card.path)}
                className="text-left"
              >
                <WorkspaceMetricCard
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  aside={
                    <div className={`rounded-xl p-2.5 ${card.iconClass}`}>
                      {card.icon}
                    </div>
                  }
                  className="transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.06)]"
                />
              </button>
            ))}
          </div>
        </WorkspaceHeroCard>

        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.15fr)_340px] xl:gap-4">
          <div className="space-y-3.5 xl:space-y-4">
            <WorkspaceSectionCard
              title="待办事项"
              description="把今天最需要处理的流程、公告和申请记录集中放在一屏里。"
              eyebrow="Today Focus"
            >
              {loadingTodo ? (
                <ListSkeleton />
              ) : pendingTasks.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={24} />}
                  title="当前没有待办"
                  description="新的审批到达后，这里会自动更新。"
                />
              ) : (
                <div className="space-y-3">
                  {pendingTasks.map((task) => (
                    <button
                      key={String(task.taskId || task.id || task.processInstanceId)}
                      type="button"
                      onClick={() => navigate('/tasks')}
                      className="flex w-full items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3.5 py-3.5 text-left transition hover:border-emerald-200 hover:bg-emerald-50/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900">
                          {task.title || task.workflowName || '流程待办'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {task.nodeName || task.currentNodeName || '待处理节点'}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          {task.applicantName ? <span>发起人：{task.applicantName}</span> : null}
                          {task.createdTime ? <span>{relTime(task.createdTime)}</span> : null}
                        </div>
                      </div>
                      <div className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        待处理
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              title="最近申请"
              description="最近发起的流程会在这里保留进度摘要。"
              eyebrow="Recent Applications"
            >
              {loadingApps ? (
                <ListSkeleton />
              ) : recentApps.length === 0 ? (
                <EmptyState
                  icon={<FileText size={24} />}
                  title="还没有申请记录"
                  description="从右侧快捷入口进入即可发起新的业务流程。"
                />
              ) : (
                <div className="space-y-3">
                  {recentApps.map((item) => (
                    <button
                      key={String(item.id || item.processInstanceId || item.businessKey)}
                      type="button"
                      onClick={() => navigate('/my-apps')}
                      className="flex w-full items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3.5 py-3.5 text-left transition hover:border-cyan-200 hover:bg-cyan-50/25"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900">
                          {item.title || item.processDefinitionName || '流程申请'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.reason || item.currentNodeName || '查看当前流程状态'}
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {item.createdTime ? relTime(item.createdTime) : '刚刚'}
                        </div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        查看详情
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </WorkspaceSectionCard>
          </div>

          <div className="space-y-3.5 xl:space-y-4">
            <WorkspaceSectionCard
              title="快捷入口"
              description="常用业务入口保留在这里，减少二次跳转。"
              eyebrow="Quick Actions"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-emerald-200 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-xl p-2 ${action.tone}`}>{action.icon}</div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{action.label}</div>
                        <div className="mt-1 text-xs text-slate-400">进入对应业务页面</div>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-slate-300" />
                  </button>
                ))}
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              title="今日日程"
              description="今天的会议和安排集中查看。"
              eyebrow="Today Schedule"
            >
              {loadingSchedule ? (
                <ListSkeleton />
              ) : schedules.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays size={24} />}
                  title="今天没有日程"
                  description="创建新的会议或个人安排后，这里会显示今日摘要。"
                />
              ) : (
                <div className="space-y-3">
                  {schedules.map((item) => (
                    <button
                      key={String(item.eventId || item.id)}
                      type="button"
                      onClick={() => navigate('/schedule')}
                      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3.5 text-left transition hover:border-amber-200 hover:bg-amber-50/25"
                    >
                      <div className="rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                        {formatClock(item.startTime) || '全天'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900">
                          {item.title || '日程安排'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatScheduleRange(item)}
                        </div>
                        {item.description ? (
                          <div className="mt-2 text-xs leading-5 text-slate-400">
                            {item.description}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </WorkspaceSectionCard>
          </div>
        </div>

        <WorkspaceSectionCard
          title="公告提醒"
          description="已读未读状态会保留在本地，方便你快速回看。"
          eyebrow="Announcements"
          headerAside={
            <Button variant="outline" size="sm" onClick={() => navigate('/announcement')}>
              查看全部
            </Button>
          }
        >
          {loadingAnnouncements ? (
            <ListSkeleton />
          ) : announcements.length === 0 ? (
            <EmptyState
              icon={<Bell size={24} />}
              title="暂无公告"
              description="公告发布后会自动显示在这里。"
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-3">
              {announcements.map((item) => {
                const id = String(item.announcementId || item.id);
                const isRead = readAnnouncementIds.has(id);

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      markAnnouncementAsRead(id);
                      navigate('/announcement');
                    }}
                    className={`rounded-xl border px-3.5 py-3.5 text-left transition ${
                      isRead
                        ? 'border-slate-200 bg-white hover:bg-slate-50'
                        : 'border-cyan-200 bg-cyan-50/40 hover:bg-cyan-50/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {item.title || '系统公告'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.publishTime ? relTime(item.publishTime) : '刚刚发布'}
                        </div>
                      </div>
                      {!isRead ? (
                        <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-medium text-cyan-700">
                          未读
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 line-clamp-3 text-xs leading-6 text-slate-500">
                      {item.summary || item.content || '点击查看完整公告内容'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </WorkspaceSectionCard>
      </div>
    </div>
  );
};
