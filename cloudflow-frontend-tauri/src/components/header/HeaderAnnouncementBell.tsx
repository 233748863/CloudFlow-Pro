import React from 'react';
import { NoticeBell } from '@/components/common';

interface HeaderAnnouncementBellProps {
  unreadCount?: number;
}

/**
 * 兼容层：保留旧组件路径和入参，内部切到站内信铃铛。
 */
export const HeaderAnnouncementBell: React.FC<HeaderAnnouncementBellProps> = () => {
  return <NoticeBell />;
};
