import React from 'react';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MailOpen,
} from 'lucide-react';
import { StatCard } from '@/components/common';

export interface UserDashboardStatsData {
  pendingCount: number;
  myAppsCount: number;
  copyCount: number;
  doneCount: number;
  unreadAnnouncementCount: number;
  scheduleCount: number;
}

interface UserDashboardStatsProps {
  stats: UserDashboardStatsData;
}

export const UserDashboardStats: React.FC<UserDashboardStatsProps> = ({ stats }) => {
  const cards = [
    {
      title: '待办审批',
      value: stats.pendingCount.toLocaleString(),
      icon: <ClipboardCheck size={20} />,
      iconVariant: 'primary' as const,
      meta: '需要优先处理',
    },
    {
      title: '我的申请',
      value: stats.myAppsCount.toLocaleString(),
      icon: <FileText size={20} />,
      iconVariant: 'gray' as const,
      meta: '已发起流程',
    },
    {
      title: '抄送我的',
      value: stats.copyCount.toLocaleString(),
      icon: <MailOpen size={20} />,
      iconVariant: 'warning' as const,
      meta: '待查看消息',
    },
    {
      title: '已完成',
      value: stats.doneCount.toLocaleString(),
      icon: <CheckCircle2 size={20} />,
      iconVariant: 'success' as const,
      meta: '近期处理结果',
    },
    {
      title: '未读公告',
      value: stats.unreadAnnouncementCount.toLocaleString(),
      icon: <Bell size={20} />,
      iconVariant: 'warning' as const,
      meta: '需要关注提醒',
    },
    {
      title: '今日日程',
      value: stats.scheduleCount.toLocaleString(),
      icon: <CalendarDays size={20} />,
      iconVariant: 'gray' as const,
      meta: '今日安排数量',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <StatCard
          key={card.title}
          title={card.title}
          value={card.value}
          icon={card.icon}
          iconVariant={card.iconVariant}
          meta={card.meta}
        />
      ))}
    </div>
  );
};
