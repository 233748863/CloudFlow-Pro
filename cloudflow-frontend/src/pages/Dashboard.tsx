import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Megaphone,
  PlayCircle,
  Users,
} from 'lucide-react';
import type { Announcement, SysScheduleEvent } from '@/types';
import { LoadingSpinner } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getAnnouncementExcerpt } from '@/utils/announcementContent';
import {
  getMyAnnouncements,
  markAnnouncementRead,
} from '@/services/api/announcement';
import { getMyEvents } from '@/services/api/schedule';
import {
  getCopyUnreadCount,
  getMyInstances,
  getTaskStatistics,
  getTodoTasks,
} from '@/services/api/workflow';
import {
  UserDashboardCharts,
  UserDashboardQuickAction,
  UserDashboardQuickActions,
  UserDashboardRecentUsage,
  UserDashboardRecentUsageItem,
  UserDashboardRiskItem,
  UserDashboardRiskPanel,
  UserDashboardStats,
  UserDashboardStatsData,
  UserDashboardTodoItem,
  UserDashboardTodoPanel,
} from '@/components/user/dashboard';
import { getWorkplaceSummary, RiskItem, TodayItem } from '@/services/api/workplace';

type DashboardGranularity = 'day' | 'hour';

interface TaskStatisticsResponse {
  timePeriod?: {
    todayTodo?: number;
    weekTodo?: number;
    monthTodo?: number;
  };
  status?: {
    todo?: number;
    done?: number;
    timeout?: number;
  };
  avgDurationMinutes?: number;
  completionRate?: string;
  myInstanceCount?: number;
}

interface DashboardOverview {
  pendingCount: number;
  myAppsCount: number;
  copyCount: number;
  doneCount: number;
  todayTodoCount: number;
  weekTodoCount: number;
  monthTodoCount: number;
  avgDurationMinutes: number;
  completionRate: number;
  todayScheduleCount: number;
  unreadAnnouncementIds: string[];
}

interface DashboardActivityPanels {
  todoTasks: any[];
  applications: any[];
  announcements: Announcement[];
  schedules: SysScheduleEvent[];
}

interface WorkplacePanels {
  todos: TodayItem[];
  risks: RiskItem[];
}

interface DashboardTrendDraft {
  bucketKey: string;
  label: string;
  shortLabel: string;
  tasks: number;
  applications: number;
  announcements: number;
  schedules: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const parseDateLike = (value?: string | null) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseLocalDate(value);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const extractRows = <T,>(response: unknown): T[] => {
  if (Array.isArray(response)) {
    return response as T[];
  }

  if (response && typeof response === 'object') {
    const value = response as Record<string, unknown>;
    if (Array.isArray(value.rows)) return value.rows as T[];
    if (Array.isArray(value.records)) return value.records as T[];
    if (Array.isArray(value.data)) return value.data as T[];
    if (Array.isArray(value.list)) return value.list as T[];
  }

  return [];
};

const safeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const parsePercent = (value?: string) => {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const isWithinRange = (value: string | undefined, startDate: string, endDate: string) => {
  const date = parseDateLike(value);
  if (!date) return false;

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  end.setHours(23, 59, 59, 999);

  return date >= start && date <= end;
};

const formatRelativeTime = (value?: string) => {
  const date = parseDateLike(value);
  if (!date) return '刚刚';

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;

  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

const formatTimeOnly = (value?: string) => {
  const date = parseDateLike(value);
  if (!date) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatScheduleRange = (item: SysScheduleEvent) => {
  if (item.isAllDay) return '全天安排';

  const start = formatTimeOnly(item.startTime);
  const end = formatTimeOnly(item.endTime);

  if (start && end) return `${start} - ${end}`;
  return start || end || '时间待定';
};

const formatRangeLabel = (startDate: string, endDate: string) => {
  if (startDate === endDate) {
    return `${startDate} 当天`;
  }

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000);

  if (diffDays === 6) return '最近 7 天';
  if (diffDays === 29) return '最近 30 天';

  return `${startDate} 至 ${endDate}`;
};

const buildTrendBuckets = (
  startDate: string,
  endDate: string,
  granularity: DashboardGranularity,
) => {
  const buckets: DashboardTrendDraft[] = [];

  if (granularity === 'day') {
    const cursor = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);

    while (cursor <= end) {
      buckets.push({
        bucketKey: formatLocalDate(cursor),
        label: `${cursor.getMonth() + 1} 月 ${cursor.getDate()} 日`,
        shortLabel: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
        tasks: 0,
        applications: 0,
        announcements: 0,
        schedules: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const cursor = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    end.setHours(23, 0, 0, 0);

    while (cursor <= end) {
      buckets.push({
        bucketKey: `${formatLocalDate(cursor)} ${pad(cursor.getHours())}:00`,
        label: `${cursor.getMonth() + 1}/${cursor.getDate()} ${pad(cursor.getHours())}:00`,
        shortLabel: `${cursor.getMonth() + 1}/${cursor.getDate()} ${pad(cursor.getHours())}:00`,
        tasks: 0,
        applications: 0,
        announcements: 0,
        schedules: 0,
      });
      cursor.setHours(cursor.getHours() + 1);
    }
  }

  return buckets;
};

const getBucketKey = (value: string | undefined, granularity: DashboardGranularity) => {
  const date = parseDateLike(value);
  if (!date) return '';

  if (granularity === 'day') {
    return formatLocalDate(date);
  }

  return `${formatLocalDate(date)} ${pad(date.getHours())}:00`;
};

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [activityPanels, setActivityPanels] = useState<DashboardActivityPanels>({
    todoTasks: [],
    applications: [],
    announcements: [],
    schedules: [],
  });
  const [workplacePanels, setWorkplacePanels] = useState<WorkplacePanels>({
    todos: [],
    risks: [],
  });
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return formatLocalDate(date);
  });
  const [endDate, setEndDate] = useState(() => formatLocalDate(new Date()));
  const [granularity, setGranularity] = useState<DashboardGranularity>('day');
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingPanels, setLoadingPanels] = useState(true);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('read_announcements');
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  // 仪表盘顶部统计卡固定读取真实统计接口，保证与业务状态一致。
  const loadOverview = async () => {
    setLoadingOverview(true);

    const today = formatLocalDate(new Date());
    const [taskStatsResult, copyCountResult, announcementsResult, schedulesResult, workplaceSummaryResult] =
      await Promise.allSettled([
        getTaskStatistics(),
        getCopyUnreadCount(),
        getMyAnnouncements(),
        getMyEvents(today, today),
        getWorkplaceSummary(),
      ]);

    const taskStats =
      taskStatsResult.status === 'fulfilled'
        ? (taskStatsResult.value as TaskStatisticsResponse)
        : {};
    const allAnnouncements =
      announcementsResult.status === 'fulfilled' ? announcementsResult.value : [];
    const todaySchedules =
      schedulesResult.status === 'fulfilled' ? schedulesResult.value : [];

    setOverview({
      pendingCount: safeNumber(taskStats.status?.todo),
      myAppsCount: safeNumber(taskStats.myInstanceCount),
      copyCount: copyCountResult.status === 'fulfilled' ? safeNumber(copyCountResult.value) : 0,
      doneCount: safeNumber(taskStats.status?.done),
      todayTodoCount: safeNumber(taskStats.timePeriod?.todayTodo),
      weekTodoCount: safeNumber(taskStats.timePeriod?.weekTodo),
      monthTodoCount: safeNumber(taskStats.timePeriod?.monthTodo),
      avgDurationMinutes: safeNumber(taskStats.avgDurationMinutes),
      completionRate: parsePercent(taskStats.completionRate),
      todayScheduleCount: todaySchedules.length,
      unreadAnnouncementIds: allAnnouncements
        .filter((item) => !item.isRead)
        .map((item) => String(item.announcementId)),
    });

    if (workplaceSummaryResult.status === 'fulfilled' && workplaceSummaryResult.value) {
      setWorkplacePanels({
        todos: workplaceSummaryResult.value.todayItems || [],
        risks: workplaceSummaryResult.value.riskItems || [],
      });
    }

    setLoadingOverview(false);
  };

  // 图表和最近活动跟随时间范围切换，直接读取筛选后的真实列表数据。
  const loadActivityPanels = async () => {
    setLoadingPanels(true);

    const [todoResult, applicationsResult, announcementsResult, schedulesResult] =
      await Promise.allSettled([
        getTodoTasks({
          pageNum: 1,
          pageSize: 80,
          startTimeFrom: startDate,
          startTimeTo: endDate,
        }),
        getMyInstances({
          pageNum: 1,
          pageSize: 80,
          startTimeFrom: startDate,
          startTimeTo: endDate,
        }),
        getMyAnnouncements(),
        getMyEvents(startDate, endDate),
      ]);

    const todoTasks =
      todoResult.status === 'fulfilled' ? extractRows<any>(todoResult.value) : [];
    const applications =
      applicationsResult.status === 'fulfilled'
        ? extractRows<any>(applicationsResult.value)
        : [];
    const announcements =
      announcementsResult.status === 'fulfilled'
        ? announcementsResult.value.filter((item) =>
            isWithinRange(item.publishTime || item.createTime, startDate, endDate),
          )
        : [];
    const schedules =
      schedulesResult.status === 'fulfilled' ? schedulesResult.value : [];

    setActivityPanels({
      todoTasks,
      applications,
      announcements,
      schedules,
    });

    setLoadingPanels(false);
  };

  useEffect(() => {
    if (!user) return;
    void loadOverview();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadActivityPanels();
  }, [user, startDate, endDate]);

  const unreadAnnouncementCount = useMemo(() => {
    if (!overview) return 0;
    return overview.unreadAnnouncementIds.filter((id) => !readAnnouncementIds.has(id)).length;
  }, [overview, readAnnouncementIds]);

  const statsData = useMemo<UserDashboardStatsData | null>(() => {
    if (!overview) return null;

    return {
      pendingCount: overview.pendingCount,
      myAppsCount: overview.myAppsCount,
      copyCount: overview.copyCount,
      doneCount: overview.doneCount,
      unreadAnnouncementCount,
      scheduleCount: overview.todayScheduleCount,
      completionRate: overview.completionRate,
      focusCount:
        overview.pendingCount +
        overview.copyCount +
        unreadAnnouncementCount +
        overview.todayScheduleCount,
      todayTodoCount: overview.todayTodoCount,
      weekTodoCount: overview.weekTodoCount,
      monthTodoCount: overview.monthTodoCount,
      avgDurationMinutes: overview.avgDurationMinutes,
    };
  }, [overview, unreadAnnouncementCount]);

  const distribution = useMemo(
    () => [
      {
        label: '待办审批',
        count: activityPanels.todoTasks.length,
        description: '当前时间范围内需要处理的审批任务',
        tone: 'cyan' as const,
      },
      {
        label: '我的申请',
        count: activityPanels.applications.length,
        description: '我发起并仍在跟踪的流程申请',
        tone: 'emerald' as const,
      },
      {
        label: '公告提醒',
        count: activityPanels.announcements.length,
        description: '命中当前时间范围的公司公告',
        tone: 'amber' as const,
      },
      {
        label: '日程安排',
        count: activityPanels.schedules.length,
        description: '时间范围内的会议与个人安排',
        tone: 'slate' as const,
      },
    ],
    [activityPanels],
  );

  const trendData = useMemo(() => {
    const buckets = buildTrendBuckets(startDate, endDate, granularity);
    const bucketMap = new Map(buckets.map((bucket) => [bucket.bucketKey, bucket]));

    activityPanels.todoTasks.forEach((item) => {
      const key = getBucketKey(item.createTime || item.createdTime, granularity);
      const bucket = bucketMap.get(key);
      if (bucket) bucket.tasks += 1;
    });

    activityPanels.applications.forEach((item) => {
      const key = getBucketKey(item.createTime || item.createdTime, granularity);
      const bucket = bucketMap.get(key);
      if (bucket) bucket.applications += 1;
    });

    activityPanels.announcements.forEach((item) => {
      const key = getBucketKey(item.publishTime || item.createTime, granularity);
      const bucket = bucketMap.get(key);
      if (bucket) bucket.announcements += 1;
    });

    activityPanels.schedules.forEach((item) => {
      const key = getBucketKey(item.startTime, granularity);
      const bucket = bucketMap.get(key);
      if (bucket) bucket.schedules += 1;
    });

    return buckets.map(({ bucketKey, ...rest }) => rest);
  }, [activityPanels, endDate, granularity, startDate]);

  const quickActions = useMemo<UserDashboardQuickAction[]>(
    () => [
      {
        label: '发起流程',
        description: '进入流程目录，快速发起业务审批。',
        icon: <PlayCircle size={20} />,
        onClick: () => navigate('/workplace'),
        toneClassName:
          'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200',
      },
      {
        label: '任务中心',
        description: '集中处理待办、已办和我的申请。',
        icon: <ClipboardCheck size={20} />,
        onClick: () => navigate('/tasks'),
        toneClassName:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
      },
      {
        label: '公告中心',
        description: '查看最新通知、制度变更和全员提醒。',
        icon: <Megaphone size={20} />,
        onClick: () => navigate('/announcement'),
        toneClassName:
          'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200',
      },
      {
        label: '今日日程',
        description: '打开日历，查看会议和个人安排。',
        icon: <CalendarDays size={20} />,
        onClick: () => navigate('/schedule'),
        toneClassName:
          'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
      },
      {
        label: '会议室预订',
        description: '查看会议室资源并发起预订。',
        icon: <Users size={20} />,
        onClick: () => navigate('/meeting-room'),
        toneClassName:
          'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200',
      },
    ],
    [navigate],
  );

  const recentUsageItems = useMemo<UserDashboardRecentUsageItem[]>(() => {
    const items: Array<UserDashboardRecentUsageItem & { sortTime: number }> = [];

    activityPanels.todoTasks.forEach((item) => {
      const time = parseDateLike(item.createTime || item.createdTime)?.getTime() ?? 0;
      items.push({
        id: `todo-${String(item.taskId || item.id || item.processInstanceId)}`,
        title: item.title || item.workflowName || '待办审批',
        description: item.nodeName || item.currentNodeName || '待处理节点',
        timeLabel: formatRelativeTime(item.createTime || item.createdTime),
        typeLabel: '待办审批',
        icon: <ClipboardCheck size={18} />,
        toneClassName:
          'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200',
        onClick: () => navigate('/tasks'),
        sortTime: time,
      });
    });

    activityPanels.applications.forEach((item) => {
      const time = parseDateLike(item.createTime || item.createdTime)?.getTime() ?? 0;
      items.push({
        id: `application-${String(item.id || item.processInstanceId || item.businessKey)}`,
        title: item.title || item.processDefinitionName || '流程申请',
        description: item.currentNodeName || item.processNo || '查看流程当前状态',
        timeLabel: formatRelativeTime(item.createTime || item.createdTime),
        typeLabel: '我的申请',
        icon: <FileText size={18} />,
        toneClassName:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
        onClick: () => navigate('/my-apps'),
        sortTime: time,
      });
    });

    activityPanels.announcements.forEach((item) => {
      const announcementId = String(item.announcementId);
      const time =
        parseDateLike(item.publishTime || item.createTime)?.getTime() ?? 0;
      items.push({
        id: `announcement-${announcementId}`,
        title: item.title || '公告提醒',
        description: getAnnouncementExcerpt(item.content),
        timeLabel: formatRelativeTime(item.publishTime || item.createTime),
        typeLabel: '公告提醒',
        icon: <Bell size={18} />,
        toneClassName:
          'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200',
        onClick: () => {
          setReadAnnouncementIds((current) => {
            const next = new Set(current);
            next.add(announcementId);
            try {
              localStorage.setItem('read_announcements', JSON.stringify([...next]));
            } catch {
              // 本地阅读状态只做即时反馈，存储失败不影响主流程。
            }
            return next;
          });
          void markAnnouncementRead(announcementId).catch(() => undefined);
          navigate('/announcement');
        },
        sortTime: time,
      });
    });

    activityPanels.schedules.forEach((item) => {
      const time = parseDateLike(item.startTime)?.getTime() ?? 0;
      items.push({
        id: `schedule-${String(item.eventId)}`,
        title: item.title || '日程安排',
        description: item.description || formatScheduleRange(item),
        timeLabel: formatRelativeTime(item.startTime),
        typeLabel: '日程安排',
        icon: <CalendarDays size={18} />,
        toneClassName:
          'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        onClick: () => navigate('/schedule'),
        sortTime: time,
      });
    });

    return items
      .sort((left, right) => right.sortTime - left.sortTime)
      .slice(0, 6)
      .map(({ sortTime, ...rest }) => rest);
  }, [activityPanels, navigate]);

  const workplaceTodoItems = useMemo<UserDashboardTodoItem[]>(
    () =>
      workplacePanels.todos.slice(0, 6).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        sourceLabel: item.sourceLabel || item.module || item.type,
        onClick: () => navigate(item.path || '/dashboard'),
      })),
    [navigate, workplacePanels.todos],
  );

  const workplaceRiskItems = useMemo<UserDashboardRiskItem[]>(
    () =>
      workplacePanels.risks.slice(0, 6).map((item) => ({
        id: String(item.id),
        title: item.title,
        description: item.description,
        level: item.level,
        sourceLabel: item.sourceLabel || item.module || item.businessType,
        onClick: () => navigate(item.path || '/dashboard'),
      })),
    [navigate, workplacePanels.risks],
  );

  if (!user) {
    return null;
  }

  if (loadingOverview && !statsData) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {statsData ? <UserDashboardStats stats={statsData} /> : null}

      <UserDashboardCharts
        startDate={startDate}
        endDate={endDate}
        granularity={granularity}
        loading={loadingPanels}
        distribution={distribution}
        trend={trendData}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onGranularityChange={setGranularity}
        onRefresh={() => {
          void loadOverview();
          void loadActivityPanels();
        }}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UserDashboardRecentUsage
            items={recentUsageItems}
            loading={loadingPanels}
            rangeLabel={formatRangeLabel(startDate, endDate)}
          />
        </div>
        <div className="lg:col-span-1">
          <UserDashboardQuickActions actions={quickActions} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <UserDashboardTodoPanel items={workplaceTodoItems} loading={loadingOverview && workplaceTodoItems.length === 0} />
        <UserDashboardRiskPanel items={workplaceRiskItems} loading={loadingOverview && workplaceRiskItems.length === 0} />
      </div>
    </div>
  );
};

export default Dashboard;
