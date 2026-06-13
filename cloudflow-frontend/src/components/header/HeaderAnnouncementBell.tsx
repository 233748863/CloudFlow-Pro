import React from 'react';
import { UnifiedMessageBell } from '@/components/common';

interface HeaderAnnouncementBellProps {
  unreadCount?: number;
}

/**
 * 兼容层：保留旧组件路径和入参，内部切到统一消息铃铛。
 */
export const HeaderAnnouncementBell: React.FC<HeaderAnnouncementBellProps> = () => {
  return <UnifiedMessageBell />;
};
