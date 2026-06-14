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
      wrapClassName:
        'rounded-lg bg-cyan-100 p-2 dark:bg-cyan-950/30',
      iconClassName: 'text-cyan-700 dark:text-cyan-200',
      valueClassName: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: '我的申请',
      value: stats.myAppsCount,
      meta: '累计发起流程',
      icon: <FileText size={18} />,
      wrapClassName:
        'rounded-lg bg-emerald-100 p-2 dark:bg-emerald-950/30',
      iconClassName: 'text-emerald-700 dark:text-emerald-200',
      valueClassName: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: '待查看抄送',
      value: stats.copyCount,
      meta: '需要确认的协同消息',
      icon: <MailOpen size={18} />,
      wrapClassName:
        'rounded-lg bg-amber-100 p-2 dark:bg-amber-950/30',
      iconClassName: 'text-amber-700 dark:text-amber-200',
      valueClassName: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: '已完成',
      value: stats.doneCount,
      meta: `平均耗时 ${stats.avgDurationMinutes} 分钟`,
      icon: <CheckCircle2 size={18} />,
      wrapClassName:
        'rounded-lg bg-teal-100 p-2 dark:bg-teal-950/30',
      iconClassName: 'text-teal-700 dark:text-teal-200',
      valueClassName: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: '未读公告',
      value: stats.unreadAnnouncementCount,
      meta: '需要及时查看的制度与通知',
      icon: <Bell size={18} />,
      wrapClassName:
        'rounded-lg bg-orange-100 p-2 dark:bg-orange-950/30',
      iconClassName: 'text-orange-700 dark:text-orange-200',
      valueClassName: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: '今日日程',
      value: stats.scheduleCount,
      meta: '会议与个人安排总数',
      icon: <CalendarDays size={18} />,
      wrapClassName:
        'rounded-lg bg-slate-200 p-2 dark:bg-slate-800',
      iconClassName: 'text-slate-700 dark:text-slate-200',
      valueClassName: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: '处理完成率',
      value: `${stats.completionRate.toFixed(1)}%`,
      meta: `本周待办 ${stats.weekTodoCount}`,
      icon: <TimerReset size={18} />,
      wrapClassName:
        'rounded-lg bg-sky-100 p-2 dark:bg-sky-950/30',
      iconClassName: 'text-sky-700 dark:text-sky-200',
      valueClassName: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: '待关注事项',
      value: stats.focusCount,
      meta: `本月待办 ${stats.monthTodoCount}`,
      icon: <ScanSearch size={18} />,
      wrapClassName:
        'rounded-lg bg-rose-100 p-2 dark:bg-rose-950/30',
      iconClassName: 'text-rose-700 dark:text-rose-200',
      valueClassName: 'text-slate-900 dark:text-slate-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="card p-5 rounded-2xl border-slate-100/80 dark:border-slate-800/50 hover-scale-premium bg-gradient-to-br from-white/95 to-slate-50/30 dark:from-slate-900/95 dark:to-slate-950/30 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.02)]"
        >
          <div className="flex items-center gap-4">
            <div className={`${card.wrapClassName} rounded-xl p-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.01)] transition-transform duration-300 hover:scale-105`}>
              <span className={card.iconClassName}>{card.icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 tracking-wide uppercase">
                {card.label}
              </p>
              <p className={`text-2xl font-bold tracking-tight mt-0.5 ${card.valueClassName}`}>
                {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">{card.meta}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
