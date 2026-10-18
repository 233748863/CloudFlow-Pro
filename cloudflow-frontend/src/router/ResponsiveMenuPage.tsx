import React, { Suspense, type ReactNode } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { PageLoading } from '@/components/common/PageLoading';

// 复用菜单地址与权限；视口只切换展示，设备功能继续由原设备判断控制。
const mobilePages = {
  Dashboard: React.lazy(() => import('@/mobile/pages/MobileDashboard').then(module => ({ default: module.MobileDashboard }))),
  TaskListPage: React.lazy(() => import('@/mobile/pages/MobileTasks').then(module => ({ default: module.MobileTasks }))),
  SchedulePage: React.lazy(() => import('@/mobile/pages/MobileSchedule').then(module => ({ default: module.MobileSchedule }))),
  MeetingRoomPage: React.lazy(() => import('@/mobile/pages/MobileMeetingRoom').then(module => ({ default: module.MobileMeetingRoom }))),
  LeaveApplicationPage: React.lazy(() => import('@/mobile/pages/MobileLeaveApplication').then(module => ({ default: module.MobileLeaveApplication }))),
};

export type ResponsiveMenuPageName = keyof typeof mobilePages;

export function findMobileMenuPage(moduleKey: string, pathname: string) {
  // 同一正式页面也承载“我的申请”，该模式必须保留原申请列表。
  if (moduleKey === '../pages/TaskListPage.tsx' && pathname !== '/tasks') return null;
  const name = Object.keys(mobilePages).find(page => moduleKey === `../pages/${page}.tsx`);
  return name && Object.prototype.hasOwnProperty.call(mobilePages, name)
    ? mobilePages[name as ResponsiveMenuPageName] : null;
}

export function ResponsiveMenuPage({ page, children }: { page: ResponsiveMenuPageName; children: ReactNode }) {
  const breakpoint = useBreakpoint();
  if (breakpoint !== 'mobile') return <>{children}</>;
  const Page = mobilePages[page];
  return <Suspense fallback={<PageLoading tip="正在加载页面…" />}><Page /></Suspense>;
}
