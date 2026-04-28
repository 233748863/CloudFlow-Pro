import React, { Suspense } from 'react';
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Navigate,
  useRouteError,
} from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { HrRouteGuard } from '@/components/common/RouteGuard';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { isMobileDevice } from '@/utils/device';
import { logger } from '@/utils/logger';
import { MobileLayout } from '@/mobile/layouts/MobileLayout';

const MobileDashboard = React.lazy(() =>
  import('@/mobile/pages/MobileDashboard').then((module) => ({ default: module.MobileDashboard })),
);
const MobileProfile = React.lazy(() =>
  import('@/mobile/pages/MobileProfile').then((module) => ({ default: module.MobileProfile })),
);
const MobileMessages = React.lazy(() =>
  import('@/mobile/pages/MobileMessages').then((module) => ({ default: module.MobileMessages })),
);
const MobileSchedule = React.lazy(() =>
  import('@/mobile/pages/MobileSchedule').then((module) => ({ default: module.MobileSchedule })),
);
const MobileLeaveApplication = React.lazy(() =>
  import('@/mobile/pages/MobileLeaveApplication').then((module) => ({
    default: module.MobileLeaveApplication,
  })),
);

const Dashboard = React.lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const Workplace = React.lazy(() =>
  import('./pages/Workplace').then((module) => ({ default: module.Workplace })),
);
const ProfilePage = React.lazy(() =>
  import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const OrgStructurePage = React.lazy(() =>
  import('./pages/OrgStructurePage').then((module) => ({ default: module.OrgStructurePage })),
);
const UserList = React.lazy(() =>
  import('./pages/system/UserList').then((module) => ({ default: module.UserList })),
);
const RoleList = React.lazy(() =>
  import('./pages/system/RoleList').then((module) => ({ default: module.RoleList })),
);
const MenuList = React.lazy(() =>
  import('./pages/system/MenuList').then((module) => ({ default: module.MenuList })),
);
const TenantList = React.lazy(() =>
  import('./pages/system/TenantList').then((module) => ({ default: module.TenantList })),
);
const PostList = React.lazy(() =>
  import('./pages/system/PostList').then((module) => ({ default: module.PostList })),
);
const ConfigList = React.lazy(() =>
  import('./pages/system/ConfigList').then((module) => ({ default: module.ConfigList })),
);
const DictPage = React.lazy(() => import('./pages/admin/DictPage'));
const AnnouncementPage = React.lazy(() =>
  import('./pages/AnnouncementPage').then((module) => ({ default: module.AnnouncementPage })),
);
const SchedulePage = React.lazy(() =>
  import('./pages/SchedulePage').then((module) => ({ default: module.SchedulePage })),
);
const ContactPage = React.lazy(() => import('./pages/ContactPage'));
const OvertimeApplicationPage = React.lazy(() => import('./pages/OvertimeApplicationPage'));
const LeaveApplicationPage = React.lazy(() => import('./pages/LeaveApplicationPage'));
const HrDashboardPage = React.lazy(() =>
  import('./pages/hr/HrDashboardPage').then((module) => ({ default: module.default })),
);
const HrEmployeePage = React.lazy(() =>
  import('./pages/hr/HrEmployeePage').then((module) => ({ default: module.default })),
);
const HrLeaveQuotaPage = React.lazy(() =>
  import('./pages/hr/HrLeaveQuotaPage').then((module) => ({ default: module.default })),
);
const HrApprovalPage = React.lazy(() =>
  import('./pages/hr/HrApprovalPage').then((module) => ({ default: module.default })),
);

const Loading = () => (
  <div className="flex h-full min-h-[400px] w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-600 dark:border-slate-800 dark:border-t-cyan-400" />
  </div>
);

interface RouteStatusPageProps {
  code: string;
  title: string;
  description: string;
}

const RouteStatusPage = ({ code, title, description }: RouteStatusPageProps) => (
  <div className="flex min-h-[60vh] items-center justify-center bg-slate-50/80 px-6 py-12 dark:bg-slate-950/70">
    <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="text-sm font-semibold text-cyan-600 dark:text-cyan-300">{code}</div>
      <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
      <button
        type="button"
        onClick={() => {
          window.location.href = import.meta.env.BASE_URL || '/';
        }}
        className="mt-6 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
      >
        返回首页
      </button>
    </div>
  </div>
);

const RouteErrorPage = () => {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <RouteStatusPage
        code={String(error.status)}
        title={error.status === 404 ? '页面不存在' : '页面加载失败'}
        description={error.statusText || '当前地址在轻版中没有对应页面。'}
      />
    );
  }

  return (
    <RouteStatusPage
      code="500"
      title="页面加载失败"
      description={error instanceof Error ? error.message : '发生未知错误。'}
    />
  );
};

const RouteNotFoundPage = () => (
  <RouteStatusPage code="404" title="页面不存在" description="当前功能已从轻版中移除。" />
);

const withSuspense = (element: React.ReactNode) => <Suspense fallback={<Loading />}>{element}</Suspense>;

const desktopRoutes = [
  {
    path: '/login',
    element: <Login />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/register',
    element: <Register />,
    errorElement: <RouteErrorPage />,
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <MainLayout />,
        errorElement: <RouteErrorPage />,
        children: [
          { path: '/', element: withSuspense(<Dashboard />) },
          { path: '/dashboard', element: withSuspense(<Dashboard />) },
          { path: '/workplace', element: withSuspense(<Workplace />) },
          { path: '/profile', element: withSuspense(<ProfilePage />) },
          { path: '/announcement', element: withSuspense(<AnnouncementPage />) },
          { path: '/office/announcement', element: withSuspense(<AnnouncementPage />) },
          { path: '/schedule', element: withSuspense(<SchedulePage />) },
          { path: '/office/contact', element: withSuspense(<ContactPage />) },
          { path: '/users', element: withSuspense(<OrgStructurePage />) },
          { path: '/hr', element: <Navigate to="/hr/dashboard" replace /> },
          { path: '/hr/dashboard', element: withSuspense(<HrDashboardPage />) },
          { path: '/hr/employees', element: withSuspense(<HrEmployeePage />) },
          { path: '/hr/approvals', element: withSuspense(<HrRouteGuard><HrApprovalPage /></HrRouteGuard>) },
          { path: '/hr/leave/quota', element: withSuspense(<HrLeaveQuotaPage />) },
          { path: '/hr/overtime/applications', element: withSuspense(<OvertimeApplicationPage />) },
          { path: '/hr/leave/application', element: withSuspense(<LeaveApplicationPage />) },
          { path: '/system/users', element: withSuspense(<UserList />) },
          { path: '/system/roles', element: withSuspense(<RoleList />) },
          { path: '/system/menus', element: withSuspense(<MenuList />) },
          { path: '/system/tenant', element: withSuspense(<TenantList />) },
          { path: '/system/post', element: withSuspense(<PostList />) },
          { path: '/system/config', element: withSuspense(<ConfigList />) },
          { path: '/system/dict', element: withSuspense(<DictPage />) },
          { path: '*', element: <RouteNotFoundPage /> },
        ],
      },
    ],
  },
];

const mobileRoutes = [
  {
    path: '/login',
    element: <Login />,
    errorElement: <RouteErrorPage />,
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <MobileLayout />,
        errorElement: <RouteErrorPage />,
        children: [
          { path: '/', element: withSuspense(<MobileDashboard />) },
          { path: '/dashboard', element: withSuspense(<MobileDashboard />) },
          { path: '/profile', element: withSuspense(<MobileProfile />) },
          { path: '/messages', element: withSuspense(<MobileMessages />) },
          { path: '/announcement', element: withSuspense(<MobileMessages />) },
          { path: '/schedule', element: withSuspense(<MobileSchedule />) },
          { path: '/hr/leave/application', element: withSuspense(<MobileLeaveApplication />) },
          { path: '/hr/overtime/applications', element: withSuspense(<OvertimeApplicationPage />) },
          { path: '*', element: <RouteNotFoundPage /> },
        ],
      },
    ],
  },
];

const isMobile = isMobileDevice();
logger.log('Device Detection:', isMobile ? 'Mobile' : 'Desktop');

const routerBaseName = import.meta.env.BASE_URL === '/'
  ? undefined
  : import.meta.env.BASE_URL.replace(/\/$/, '');

export const router = createBrowserRouter(isMobile ? mobileRoutes : desktopRoutes, {
  basename: routerBaseName,
});
