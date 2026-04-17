import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  CalendarDays,
  Car,
  CreditCard,
  FileText,
  Megaphone,
  PlayCircle,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import request from '../services/api/request';
import {
  UserDashboardAnnouncements,
  UserDashboardPendingTasks,
  UserDashboardQuickAction,
  UserDashboardQuickActions,
  UserDashboardRecentApplications,
  UserDashboardSchedules,
  UserDashboardStats,
} from '@/components/user/dashboard';

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

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

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

  const dashboardStats = useMemo(
    () => ({
      pendingCount,
      myAppsCount,
      copyCount,
      doneCount,
      unreadAnnouncementCount,
      scheduleCount: schedules.length,
    }),
    [
      copyCount,
      doneCount,
      myAppsCount,
      pendingCount,
      schedules.length,
      unreadAnnouncementCount,
    ],
  );

  const quickActions = useMemo<UserDashboardQuickAction[]>(
    () => [
      {
        label: '发起流程',
        description: '进入流程发起页',
        icon: <PlayCircle size={20} />,
        onClick: () => navigate('/workplace'),
        toneClassName: 'bg-teal-100 text-teal-600',
      },
      {
        label: '我的日程',
        description: '查看日程安排',
        icon: <CalendarDays size={20} />,
        onClick: () => navigate('/schedule'),
        toneClassName: 'bg-amber-100 text-amber-600',
      },
      {
        label: '公告中心',
        description: '查看最新通知',
        icon: <Megaphone size={20} />,
        onClick: () => navigate('/announcement'),
        toneClassName: 'bg-sky-100 text-sky-600',
      },
      {
        label: '会议预约',
        description: '进入会议室管理',
        icon: <Users size={20} />,
        onClick: () => navigate('/meeting-room'),
        toneClassName: 'bg-slate-100 text-slate-600',
      },
      {
        label: '报销申请',
        description: '发起报销流程',
        icon: <CreditCard size={20} />,
        onClick: () => navigate('/expense/claim'),
        toneClassName: 'bg-orange-100 text-orange-600',
      },
      {
        label: '出差申请',
        description: '提交出差流程',
        icon: <Briefcase size={20} />,
        onClick: () => navigate('/office/business-trip'),
        toneClassName: 'bg-cyan-100 text-cyan-600',
      },
      {
        label: '用车申请',
        description: '提交用车需求',
        icon: <Car size={20} />,
        onClick: () => navigate('/admin/vehicle/booking'),
        toneClassName: 'bg-violet-100 text-violet-600',
      },
      {
        label: '考勤打卡',
        description: '进入考勤页面',
        icon: <UserCheck size={20} />,
        onClick: () => navigate('/hr/attendance/checkin'),
        toneClassName: 'bg-emerald-100 text-emerald-600',
      },
    ],
    [navigate],
  );

  const formattedPendingTasks = useMemo(
    () =>
      pendingTasks.map((task) => ({
        ...task,
        createdTime: task.createdTime ? relTime(task.createdTime) : '',
      })),
    [pendingTasks],
  );

  const formattedRecentApps = useMemo(
    () =>
      recentApps.map((item) => ({
        ...item,
        createdTime: item.createdTime ? relTime(item.createdTime) : '刚刚',
      })),
    [recentApps],
  );

  const formattedSchedules = useMemo(
    () =>
      schedules.map((item) => ({
        ...item,
        startTime: formatScheduleRange(item),
      })),
    [schedules],
  );

  const formattedAnnouncements = useMemo(
    () =>
      announcements.map((item) => ({
        ...item,
        publishTime: item.publishTime ? relTime(item.publishTime) : '刚刚发布',
      })),
    [announcements],
  );

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
    <div className="space-y-6">
      <UserDashboardStats stats={dashboardStats} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <UserDashboardPendingTasks
            tasks={formattedPendingTasks}
            loading={loadingTodo}
            onViewAll={() => navigate('/tasks')}
          />
        </div>
        <div className="xl:col-span-1">
          <UserDashboardQuickActions actions={quickActions} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <UserDashboardRecentApplications
          applications={formattedRecentApps}
          loading={loadingApps}
          onViewAll={() => navigate('/my-apps')}
        />
        <UserDashboardSchedules
          schedules={formattedSchedules}
          loading={loadingSchedule}
          onViewAll={() => navigate('/schedule')}
        />
      </div>

      <UserDashboardAnnouncements
        announcements={formattedAnnouncements}
        readIds={readAnnouncementIds}
        loading={loadingAnnouncements}
        onOpenList={() => navigate('/announcement')}
        onOpenItem={(id) => {
          markAnnouncementAsRead(id);
          navigate('/announcement');
        }}
      />
    </div>
  );
};
