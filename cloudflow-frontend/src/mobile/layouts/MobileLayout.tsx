import React from 'react';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardHeight';
import { useNetworkStatus } from '@/hooks/useOffline';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { MainLayout } from '@/layouts/MainLayout';

export const MobileLayout: React.FC = () => {
  const breakpoint = useBreakpoint();
  const isOnline = useNetworkStatus();
  useKeyboardAwareScroll(breakpoint === 'mobile');

  return (
    <MainLayout
      mobileRoutes
      mobileNotice={!isOnline ? <div role="status" className="cf-mobile-offline">当前离线，仅显示已保存的只读摘要；联网后可处理业务</div> : null}
    />
  );
};
