import React from 'react';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MailOpen,
  ScanSearch,
  TimerReset,
} from 'lucide-react';
import '../../../styles/features/dashboard-stat.css';

export interface UserDashboardStatsData {
  pendingCount: number;
  myAppsCount: number;
  copyCount: number;
  doneCount: number;
  unreadAnnouncementCount: number;
  scheduleCount: number;
  completionRate: number;
  focusCount: number;
  todayTodoCount: number;
  weekTodoCount: number;
  monthTodoCount: number;
  avgDurationMinutes: number;
}

interface UserDashboardStatsProps {
  stats: UserDashboardStatsData;
}

export const UserDashboardStats: React.FC<UserDashboardStatsProps> = ({ stats }) => {
  const cards = [
    {
      label: '待办审批',
      value: stats.pendingCount,
      meta: `今日新增 ${stats.todayTodoCount}`,
      icon: <ClipboardCheck size={18} />,
      tone: 'primary',
    },
    {
      label: '我的申请',
      value: stats.myAppsCount,
      meta: '累计发起流程',
      icon: <FileText size={18} />,
      tone: 'success',
    },
    {
      label: '待查看抄送',
      value: stats.copyCount,
      meta: '需要确认的协同消息',
      icon: <MailOpen size={18} />,
      tone: 'warning',
    },
    {
      label: '已完成',
      value: stats.doneCount,
      meta: `平均耗时 ${stats.avgDurationMinutes} 分钟`,
      icon: <CheckCircle2 size={18} />,
      tone: 'neutral',
    },
    {
      label: '未读公告',
      value: stats.unreadAnnouncementCount,
      meta: '需要及时查看的制度与通知',
      icon: <Bell size={18} />,
      tone: 'warning',
    },
    {
      label: '今日日程',
      value: stats.scheduleCount,
      meta: '会议与个人安排总数',
      icon: <CalendarDays size={18} />,
      tone: 'primary',
    },
    {
      label: '处理完成率',
      value: `${stats.completionRate.toFixed(1)}%`,
      meta: `本周待办 ${stats.weekTodoCount}`,
      icon: <TimerReset size={18} />,
      tone: 'success',
      valueClassName: 'value-success',
    },
    {
      label: '待关注事项',
      value: stats.focusCount,
      meta: `本月待办 ${stats.monthTodoCount}`,
      icon: <ScanSearch size={18} />,
      tone: 'neutral',
    },
  ];

  return (
    <section className="dashboard-stats-grid">
      {cards.map((card) => (
        <article key={card.label} className="dashboard-stat">
          <span className={`dashboard-stat-icon tone-${card.tone}`}>{card.icon}</span>
          <div className="min-w-0">
            <p className="dashboard-stat-label">{card.label}</p>
            <p className={`dashboard-stat-value ${card.valueClassName ?? ''}`}>
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </p>
            <p className="dashboard-stat-meta">{card.meta}</p>
          </div>
        </article>
      ))}
    </section>
  );
};
