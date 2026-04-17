import React from 'react';
import { AnnouncementBell } from '@/components/common';

interface HeaderAnnouncementBellProps {
  unreadCount?: number;
}

/**
 * 兼容层：保留旧组件路径和入参，内部切到新的公告公共组件。
 */
export const HeaderAnnouncementBell: React.FC<HeaderAnnouncementBellProps> = () => {
  return <AnnouncementBell />;
};

