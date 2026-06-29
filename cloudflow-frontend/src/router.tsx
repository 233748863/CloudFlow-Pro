import React, { Suspense } from 'react';
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Navigate,
  Outlet,
  useRouteError,
} from 'react-router-dom';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { MainLayout } from '@/layouts/MainLayout';
import { PageLoading } from '@/components/common/PageLoading';
import { RouteGuard } from '@/components/common/RouteGuard';
import { Result404, Result500 } from '@/components/common/result';
import { DynamicMenuRoute } from '@/router/DynamicMenuRoute';
import { MobileLayout } from '@/mobile/layouts/MobileLayout';
import { isMobileDevice } from '@/utils/device';
import { logger } from '@/utils/logger';

const MobileDashboard = React.lazy(() =>
  import('@/mobile/pages/MobileDashboard').then((module) => ({
    default: module.MobileDashboard,
  })),
);
const MobileVehicleBooking = React.lazy(() =>
  import('@/mobile/pages/vehicle/MobileVehicleBooking').then((module) => ({
    default: module.MobileVehicleBooking,
  })),
);
const MobileProfile = React.lazy(() =>
  import('@/mobile/pages/MobileProfile').then((module) => ({
    default: module.MobileProfile,
  })),
);
const MobileMessages = React.lazy(() =>
  import('@/mobile/pages/MobileMessages').then((module) => ({
    default: module.MobileMessages,
  })),
);
const MobileTasks = React.lazy(() =>
  import('@/mobile/pages/MobileTasks').then((module) => ({
    default: module.MobileTasks,
  })),
);
const MobileSchedule = React.lazy(() =>
  import('@/mobile/pages/MobileSchedule').then((module) => ({
    default: module.MobileSchedule,
  })),
);
const MobileMeetingRoom = React.lazy(() =>
  import('@/mobile/pages/MobileMeetingRoom').then((module) => ({
    default: module.MobileMeetingRoom,
  })),
);
const MobileLeaveApplication = React.lazy(() =>
  import('@/mobile/pages/MobileLeaveApplication').then((module) => ({
    default: module.MobileLeaveApplication,
  })),
);
const MobileReimbursement = React.lazy(() =>
  import('@/mobile/pages/MobileReimbursement').then((module) => ({
    default: module.MobileReimbursement,
  })),
);
const MobileWorkflowMonitor = React.lazy(() =>
  import('@/mobile/pages/MobileWorkflowMonitor').then((module) => ({
    default: module.MobileWorkflowMonitor,
  })),
);

const ProfilePage = React.lazy(() =>
  import('@/pages/ProfilePage').then((module) => ({
    default: module.ProfilePage,
  })),
);
const WorkflowCreate = React.lazy(() =>
  import('@/pages/WorkflowCreate').then((module) => ({
    default: module.WorkflowCreate,
  })),
);
const Workplace = React.lazy(() =>
  import('@/pages/Workplace').then((module) => ({
    default: module.Workplace,
  })),
);
const WorkflowDesign = React.lazy(() =>
  import('@/pages/WorkflowDesign').then((module) => ({
    default: module.WorkflowDesign,
  })),
);
const VersionHistoryPage = React.lazy(() =>
  import('@/pages/VersionHistoryPage').then((module) => ({
    default: module.VersionHistoryPage,
  })),
);
const TemplateManagement = React.lazy(() =>
  import('@/pages/admin/TemplateManagement').then((module) => ({
    default: module.TemplateManagement,
  })),
);
const CrmCustomerWorkspacePage = React.lazy(() =>
  import('@/pages/CrmCustomerWorkspacePage'),
);

const Loading = () => <PageLoading tip="加载中…" />;

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<Loading />}>{node}</Suspense>
);

const guarded = (
  node: React.ReactNode,
  requiredPermissions: string[] = [],
) => (
  <RouteGuard requiredPermissions={requiredPermissions}>
    {withSuspense(node)}
  </RouteGuard>
);

const ModernRouteErrorPage = () => {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return <Result404 />;
    }
    return (
      <Result500
        error={new Error(error.statusText || '路由资源加载失败')}
      />
    );
  }

  return (
    <Result500
      error={
        error instanceof Error ? error : new Error('发生了未知错误')
      }
    />
  );
};

const desktopRoutes = [
  {
    path: '/login',
    element: <Login />,
    errorElement: <ModernRouteErrorPage />,
  },
  {
    path: '/register',
    element: <Register />,
    errorElement: <ModernRouteErrorPage />,
  },
  {
    element: (
      <RouteGuard>
        <Outlet />
      </RouteGuard>
    ),
    errorElement: <ModernRouteErrorPage />,
    children: [
      {
        element: <MainLayout />,
        errorElement: <ModernRouteErrorPage />,
        children: [
          {
            path: '/profile',
            element: guarded(<ProfilePage />, ['system:user:profile:view']),
          },
          {
            path: '/workflow/create',
            element: guarded(<WorkflowCreate />, ['workflow:process:start']),
          },
          {
            path: '/workplace',
            element: guarded(<Workplace />, ['workflow:process:start']),
          },
          {
            path: '/workflow/design',
            element: guarded(<WorkflowDesign />, ['workflow:definition:list']),
          },
          {
            path: '/workflow/versions/:workflowId',
            element: guarded(<VersionHistoryPage />, ['workflow:definition:view']),
          },
          {
            path: '/templates/manage',
            element: guarded(<TemplateManagement />, ['workflow:template:add']),
          },
          {
            path: '/office/crm/customer/:customerId',
            element: guarded(<CrmCustomerWorkspacePage />, ['crm:customer:list']),
          },
          {
            index: true,
            element: <DynamicMenuRoute />,
          },
          {
            path: '*',
            element: <DynamicMenuRoute />,
          },
        ],
      },
    ],
  },
];

const mobileRoutes = [
  {
    path: '/login',
    element: <Login />,
    errorElement: <ModernRouteErrorPage />,
  },
  {
    element: (
      <RouteGuard>
        <Outlet />
      </RouteGuard>
    ),
    errorElement: <ModernRouteErrorPage />,
    children: [
      {
        element: <MobileLayout />,
        errorElement: <ModernRouteErrorPage />,
        children: [
          {
            path: '/',
            element: withSuspense(<MobileDashboard />),
          },
          {
            path: '/vehicle/booking',
            element: withSuspense(<MobileVehicleBooking />),
          },
          {
            path: '/profile',
            element: withSuspense(<MobileProfile />),
          },
          {
            path: '/messages',
            element: withSuspense(<MobileMessages />),
          },
          {
            path: '/tasks',
            element: withSuspense(<MobileTasks />),
          },
          {
            path: '/schedule',
            element: withSuspense(<MobileSchedule />),
          },
          {
            path: '/meeting-room',
            element: withSuspense(<MobileMeetingRoom />),
          },
          {
            path: '/leave/apply',
            element: withSuspense(<MobileLeaveApplication />),
          },
          {
            path: '/reimbursement/request',
            element: withSuspense(<MobileReimbursement />),
          },
          {
            path: '/workflow/monitor',
            element: withSuspense(<MobileWorkflowMonitor />),
          },
          {
            path: '*',
            element: (
              <div className="mt-20 p-4 text-center text-gray-500">
                此功能暂不支持移动端，请在电脑访问。
              </div>
            ),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];

const isMobile = isMobileDevice();
logger.log('Device Detection:', isMobile ? 'Mobile' : 'Desktop');

export const router = createBrowserRouter(
  isMobile ? mobileRoutes : desktopRoutes,
);
