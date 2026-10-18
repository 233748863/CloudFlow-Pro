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
import { ResponsiveMenuPage } from '@/router/ResponsiveMenuPage';
import { isMobileDevice } from '@/utils/device';
import { logger } from '@/utils/logger';

const MobileLayout = React.lazy(() =>
  import('@/mobile/layouts/MobileLayout').then((module) => ({
    default: module.MobileLayout,
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
const LeaveApplicationPage = React.lazy(() => import('@/pages/LeaveApplicationPage'));
const WorkflowCreate = React.lazy(() =>
  import('@/pages/WorkflowCreate').then((module) => ({
    default: module.WorkflowCreate,
  })),
);
const WorkflowAgentPage = React.lazy(() => import('@/pages/WorkflowAgentPage'));
const WorkflowSearchInstancePage = React.lazy(() => import('@/pages/WorkflowSearchInstancePage'));
const WorkflowTaskPage = React.lazy(() => import('@/pages/WorkflowTaskPage'));
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
const HolidayDatePage = React.lazy(() => import('@/pages/system/holiday/Date'));
const CrmActivityPage = React.lazy(() => import('@/pages/CrmActivityPage'));
const MyMessagesPage = React.lazy(() => import('@/pages/system/message/Mine'));
const MessageSubscribePage = React.lazy(() => import('@/pages/system/message/Subscribe'));
const PortalPage = React.lazy(() => import('@/pages/portal/PortalPage'));
const PortalKnowledgePage = React.lazy(() => import('@/pages/portal/PortalKnowledgePage'));
const PortalTicketPage = React.lazy(() => import('@/pages/portal/PortalTicketPage'));
const PortalContractPage = React.lazy(() => import('@/pages/portal/PortalContractPage'));
const PortalFinancePage = React.lazy(() => import('@/pages/portal/PortalFinancePage'));
const OauthAuthorizationPage = React.lazy(() => import('@/pages/OauthAuthorizationPage'));
const TenantPackagePage = React.lazy(() => import('@/pages/system/TenantPackagePage'));
const TenantList = React.lazy(() => import('@/pages/system/TenantList'));
const DataSourcePage = React.lazy(() => import('@/pages/system/DataSourcePage'));
const ImConfigPage = React.lazy(() => import('@/pages/system/ImConfigPage'));
const ImSyncPage = React.lazy(() => import('@/pages/system/ImSyncPage'));
const ImBindingMinePage = React.lazy(() => import('@/pages/ImBindingMinePage'));
const ImBindingPage = React.lazy(() => import('@/pages/system/ImBindingPage'));
const OauthClientPage = React.lazy(() => import('@/pages/system/OauthClientPage'));

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

const messageManagementRoutes = [
  { path: '/system/print/template', element: guarded(<DynamicMenuRoute />, ['system:print:template:list']) },
  { path: '/message/channel', element: guarded(<DynamicMenuRoute />, ['system:message:channel:list']) },
  { path: '/message/template', element: guarded(<DynamicMenuRoute />, ['system:message:template:list']) },
  { path: '/message/record', element: guarded(<DynamicMenuRoute />, ['system:message:record:list']) },
];

const desktopRoutes = [
  {
    path: '/workflow/task/:taskId',
    element: withSuspense(<WorkflowTaskPage />),
    errorElement: <ModernRouteErrorPage />,
  },
  {
    path: '/oauth2/authorize',
    element: withSuspense(<OauthAuthorizationPage />),
    errorElement: <ModernRouteErrorPage />,
  },
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
          ...messageManagementRoutes,
          {
            path: '/leave/apply',
            element: <ResponsiveMenuPage page="LeaveApplicationPage">{withSuspense(<LeaveApplicationPage />)}</ResponsiveMenuPage>,
          },
          {
            path: '/hr/final-settlements',
            element: guarded(<DynamicMenuRoute />, ['hr:settlement:list']),
          },
          {
            path: '/hr/severance-rules',
            element: guarded(<DynamicMenuRoute />, ['hr:severance:manage']),
          },
          {
            path: '/hr/training-recoveries',
            element: guarded(<DynamicMenuRoute />, ['hr:training-recovery:manage']),
          },
          {
            path: '/hr/exit-interviews',
            element: guarded(<DynamicMenuRoute />, ['hr:exit-interview:manage']),
          },
          {
            path: '/holiday/date',
            element: guarded(<HolidayDatePage />, ['system:holiday:list']),
          },
          {
            path: '/message/mine',
            element: guarded(<MyMessagesPage />, ['system:message:mine:list']),
          },
          {
            path: '/message/subscribe',
            element: guarded(<MessageSubscribePage />, ['system:message:subscribe:list']),
          },
          {
            path: '/system/portal-users',
            element: guarded(<DynamicMenuRoute />, ['system:portal:user:list']),
          },
          {
            path: '/system/data-sources',
            element: guarded(<DataSourcePage />, ['system:data-source:list']),
          },
          {
            path: '/system/im/config',
            element: guarded(<ImConfigPage />, ['system:im:config:list']),
          },
          {
            path: '/system/im/sync',
            element: guarded(<ImSyncPage />, ['system:im:sync:list']),
          },
          {
            path: '/system/im/bindings',
            element: guarded(<ImBindingPage />, ['system:im:binding:list']),
          },
          {
            path: '/workspace/im-bindings',
            element: guarded(<ImBindingMinePage />, ['system:im:binding:mine']),
          },
          {
            path: '/system/tenant-packages',
            element: guarded(<TenantPackagePage />, ['system:tenant-package:list']),
          },
          {
            path: '/system/tenant',
            element: guarded(<TenantList />, ['system:tenant:list']),
          },
          {
            path: '/system/oauth2-clients',
            element: guarded(<OauthClientPage />, ['system:oauth2:client:list']),
          },
          {
            path: '/workspace/oauth2-grants',
            element: guarded(<DynamicMenuRoute />, ['system:oauth2:grant:list']),
          },
          {
            path: '/profile',
            element: guarded(<ProfilePage />, ['system:user:profile:view']),
          },
          {
            path: '/workflow/create',
            element: guarded(<WorkflowCreate />, ['workflow:process:start']),
          },
          {
            path: '/workflow/search-instance/:instanceId',
            element: guarded(<WorkflowSearchInstancePage />, ['workflow:process:view']),
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
    path: '/workflow/task/:taskId',
    element: withSuspense(<WorkflowTaskPage />),
    errorElement: <ModernRouteErrorPage />,
  },
  {
    path: '/oauth2/authorize',
    element: withSuspense(<OauthAuthorizationPage />),
    errorElement: <ModernRouteErrorPage />,
  },
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
        element: withSuspense(<MobileLayout />),
        errorElement: <ModernRouteErrorPage />,
        children: [
          ...messageManagementRoutes,
          {
            path: '/',
            element: <ResponsiveMenuPage page="Dashboard"><DynamicMenuRoute /></ResponsiveMenuPage>,
          },
          {
            path: '/workspace/report-charts',
            element: guarded(<DynamicMenuRoute />, ['system:report:chart:list']),
          },
          {
            path: '/workspace/report-dashboards',
            element: guarded(<DynamicMenuRoute />, ['system:report:dashboard:list']),
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
            element: <ResponsiveMenuPage page="TaskListPage"><DynamicMenuRoute /></ResponsiveMenuPage>,
          },
          {
            path: '/my-apps',
            element: guarded(<DynamicMenuRoute />, ['workflow:process:mine']),
          },
          {
            path: '/workplace',
            element: guarded(<Workplace />, ['workflow:process:start']),
          },
          {
            path: '/workflow/drafts',
            element: guarded(<DynamicMenuRoute />, ['workflow:draft:list']),
          },
          {
            path: '/workflow/my-agents',
            element: withSuspense(<WorkflowAgentPage />),
          },
          {
            path: '/workflow/search-instance/:instanceId',
            element: guarded(<WorkflowSearchInstancePage />, ['workflow:process:view']),
          },
          {
            path: '/hr/employees',
            element: guarded(<DynamicMenuRoute />, ['hr:employees:list', 'hr:employees:view']),
          },
          {
            path: '/admin/asset',
            element: guarded(<DynamicMenuRoute />, ['oa:asset:list']),
          },
          {
            path: '/office/crm/tickets',
            element: guarded(<DynamicMenuRoute />, ['crm:ticket:list']),
          },
          {
            path: '/schedule',
            element: <ResponsiveMenuPage page="SchedulePage"><DynamicMenuRoute /></ResponsiveMenuPage>,
          },
          {
            path: '/meeting-room',
            element: <ResponsiveMenuPage page="MeetingRoomPage"><DynamicMenuRoute /></ResponsiveMenuPage>,
          },
          {
            path: '/office/my-meetings',
            element: guarded(<DynamicMenuRoute />, ['oa:meeting:mine']),
          },
          {
            path: '/admin/meeting-board',
            element: guarded(<DynamicMenuRoute />, ['oa:meeting:board']),
          },
          {
            path: '/admin/meeting-usage',
            element: guarded(<DynamicMenuRoute />, ['oa:meeting:usage']),
          },
          {
            path: '/office/meeting-minutes',
            element: guarded(<DynamicMenuRoute />, ['oa:meeting:list']),
          },
          {
            path: '/office/rfqs',
            element: guarded(<DynamicMenuRoute />, ['oa:rfq:list']),
          },
          {
            path: '/admin/reports/rfqs',
            element: guarded(<DynamicMenuRoute />, ['oa:rfq:report']),
          },
          {
            path: '/crm/sales-stages',
            element: guarded(<DynamicMenuRoute />, ['crm:sales-stage:list']),
          },
          {
            path: '/crm/stage-analysis',
            element: guarded(<DynamicMenuRoute />, ['crm:opportunity:stage-analysis']),
          },
          {
            path: '/crm/deal-teams',
            element: guarded(<DynamicMenuRoute />, ['crm:deal-team:query']),
          },
          {
            path: '/crm/deal-allocations',
            element: guarded(<DynamicMenuRoute />, ['crm:deal-allocation:list']),
          },
          {
            path: '/crm/emails',
            element: guarded(<DynamicMenuRoute />, ['crm:email:list']),
          },
          {
            path: '/system/portal-users',
            element: guarded(<DynamicMenuRoute />, ['system:portal:user:list']),
          },
          {
            path: '/system/data-sources',
            element: guarded(<DataSourcePage />, ['system:data-source:list']),
          },
          {
            path: '/system/im/config',
            element: guarded(<ImConfigPage />, ['system:im:config:list']),
          },
          {
            path: '/system/im/sync',
            element: guarded(<ImSyncPage />, ['system:im:sync:list']),
          },
          {
            path: '/system/im/bindings',
            element: guarded(<ImBindingPage />, ['system:im:binding:list']),
          },
          {
            path: '/workspace/im-bindings',
            element: guarded(<ImBindingMinePage />, ['system:im:binding:mine']),
          },
          {
            path: '/system/tenant-packages',
            element: guarded(<TenantPackagePage />, ['system:tenant-package:list']),
          },
          {
            path: '/system/tenant',
            element: guarded(<TenantList />, ['system:tenant:list']),
          },
          {
            path: '/system/oauth2-clients',
            element: guarded(<OauthClientPage />, ['system:oauth2:client:list']),
          },
          {
            path: '/workspace/oauth2-grants',
            element: guarded(<DynamicMenuRoute />, ['system:oauth2:grant:list']),
          },
          {
            path: '/hr/lifecycle',
            element: guarded(<DynamicMenuRoute />, ['hr:lifecycle:list']),
          },
          {
            path: '/hr/advances',
            element: guarded(<DynamicMenuRoute />, ['hr:advance:list']),
          },
          {
            path: '/hr/referrals',
            element: guarded(<DynamicMenuRoute />, ['hr:referral:list']),
          },
          {
            path: '/hr/ess/referrals',
            element: guarded(<DynamicMenuRoute />, ['hr:referral:own']),
          },
          {
            path: '/hr/final-settlements',
            element: guarded(<DynamicMenuRoute />, ['hr:settlement:list']),
          },
          {
            path: '/hr/severance-rules',
            element: guarded(<DynamicMenuRoute />, ['hr:severance:manage']),
          },
          {
            path: '/hr/training-recoveries',
            element: guarded(<DynamicMenuRoute />, ['hr:training-recovery:manage']),
          },
          {
            path: '/hr/exit-interviews',
            element: guarded(<DynamicMenuRoute />, ['hr:exit-interview:manage']),
          },
          {
            path: '/hr/ess/advances',
            element: guarded(<DynamicMenuRoute />, ['hr:advance:own']),
          },
          {
            path: '/hr/skills',
            element: guarded(<DynamicMenuRoute />, ['hr:skill:list']),
          },
          {
            path: '/hr/overtime',
            element: guarded(<DynamicMenuRoute />, ['hr:overtime:list']),
          },
          {
            path: '/hr/overtime-types',
            element: guarded(<DynamicMenuRoute />, ['hr:overtime-type:list']),
          },
          {
            path: '/hr/shift-requests',
            element: guarded(<DynamicMenuRoute />, ['hr:shift-request:list']),
          },
          {
            path: '/hr/ess/overtime',
            element: guarded(<DynamicMenuRoute />, ['hr:overtime:mine']),
          },
          {
            path: '/hr/ess/shift-requests',
            element: guarded(<DynamicMenuRoute />, ['hr:shift-request:mine']),
          },
          {
            path: '/hr/ess/shift-invitations',
            element: guarded(<DynamicMenuRoute />, ['hr:shift-request:respond']),
          },
          {
            path: '/hr/skill-gap',
            element: guarded(<DynamicMenuRoute />, ['hr:skill:gap']),
          },
          {
            path: '/hr/ess/skills',
            element: guarded(<DynamicMenuRoute />, ['hr:skill:own']),
          },
          {
            path: '/hr/appraisal-cycles',
            element: guarded(<DynamicMenuRoute />, ['hr:appraisal:list']),
          },
          {
            path: '/hr/ess/appraisals',
            element: guarded(<DynamicMenuRoute />, ['hr:appraisal:own']),
          },
          {
            path: '/office/crm/campaign',
            element: guarded(<DynamicMenuRoute />, ['crm:campaign:list']),
          },
          {
            path: '/office/crm/target-list',
            element: guarded(<DynamicMenuRoute />, ['crm:target-list:list']),
          },
          {
            path: '/office/crm/leads',
            element: guarded(<DynamicMenuRoute />, ['crm:lead:list']),
          },
          {
            path: '/office/crm/territory',
            element: guarded(<DynamicMenuRoute />, ['crm:territory:list']),
          },
          {
            path: '/office/crm/lead-score',
            element: guarded(<DynamicMenuRoute />, ['crm:lead-score:list']),
          },
          {
            path: '/office/crm/profile-report',
            element: guarded(<DynamicMenuRoute />, ['crm:profile:report']),
          },
          {
            path: '/office/crm',
            element: guarded(<DynamicMenuRoute />, ['crm:dashboard:view']),
          },
          {
            path: '/office/crm/lost-analysis',
            element: guarded(<DynamicMenuRoute />, ['crm:lost:report']),
          },
          {
            path: '/office/crm/credit',
            element: guarded(<DynamicMenuRoute />, ['crm:credit:query']),
          },
          {
            path: '/system/rules',
            element: guarded(<DynamicMenuRoute />, ['system:rule:list']),
          },
          {
            path: '/office/crm/opportunities',
            element: guarded(<DynamicMenuRoute />, ['crm:opportunity:list']),
          },
          {
            path: '/office/crm/quotes',
            element: guarded(<DynamicMenuRoute />, ['crm:quote:list']),
          },
          {
            path: '/office/crm/receivables',
            element: guarded(<DynamicMenuRoute />, ['crm:receivable:list']),
          },
          {
            path: '/office/crm/sales-targets',
            element: guarded(<DynamicMenuRoute />, ['crm:sales-target:list']),
          },
          {
            path: '/office/contracts',
            element: guarded(<DynamicMenuRoute />, ['oa:contract:list']),
          },
          {
            path: '/office/invoice',
            element: guarded(<DynamicMenuRoute />, ['oa:invoice:list']),
          },
          {
            path: '/office/knowledge',
            element: guarded(<DynamicMenuRoute />, ['oa:knowledge:list']),
          },
          {
            path: '/system/files',
            element: guarded(<DynamicMenuRoute />, ['system:file:list']),
          },
          {
            path: '/admin/license',
            element: guarded(<DynamicMenuRoute />, ['oa:license:list']),
          },
          {
            path: '/expense/claim',
            element: guarded(<DynamicMenuRoute />, ['oa:expense:list']),
          },
          {
            path: '/hr/recruitment',
            element: guarded(<DynamicMenuRoute />, ['hr:recruitment:list']),
          },
          {
            path: '/admin/supplier',
            element: guarded(<DynamicMenuRoute />, ['oa:supplier:list']),
          },
          {
            path: '/admin/reports/suppliers',
            element: guarded(<DynamicMenuRoute />, ['oa:supplier:report']),
          },
          {
            path: '/office/project',
            element: guarded(<DynamicMenuRoute />, ['oa:project:list']),
          },
          {
            path: '/office/project/timesheets',
            element: guarded(<DynamicMenuRoute />, ['oa:timesheet:list']),
          },
          {
            path: '/office/project/templates',
            element: guarded(<DynamicMenuRoute />, ['oa:project-template:list']),
          },
          {
            path: '/admin/operations/activity-catalog',
            element: guarded(<DynamicMenuRoute />, ['oa:activity-cost:list']),
          },
          {
            path: '/admin/reports/projects',
            element: guarded(<DynamicMenuRoute />, ['oa:project:report']),
          },
          {
            path: '/office/purchase-request',
            element: guarded(<DynamicMenuRoute />, ['oa:purchase:list']),
          },
          {
            path: '/office/crm/customer/:customerId',
            element: guarded(<CrmCustomerWorkspacePage />, ['crm:customer:list']),
          },
          {
            path: '/leave/apply',
            element: <ResponsiveMenuPage page="LeaveApplicationPage">{withSuspense(<LeaveApplicationPage />)}</ResponsiveMenuPage>,
          },
          {
            path: '/codegen',
            element: guarded(<DynamicMenuRoute />, ['system:codegen:list']),
          },
          {
            path: '/office/crm/activity',
            element: guarded(<CrmActivityPage />, ['crm:activity:list']),
          },
          {
            path: '/hr/ess/leave-balance',
            element: guarded(<DynamicMenuRoute />, ['hr:ess:leave:view']),
          },
          {
            path: '/hr/ess/grievances',
            element: guarded(<DynamicMenuRoute />, ['hr:grievance:mine:list']),
          },
          {
            path: '/hr/grievances',
            element: guarded(<DynamicMenuRoute />, ['hr:grievance:manage:list']),
          },
          {
            path: '/hr/labor-dispute-list',
            element: guarded(<DynamicMenuRoute />, ['hr:dispute:list']),
          },
          {
            path: '/hr/performance',
            element: guarded(<DynamicMenuRoute />, ['hr:performance:list']),
          },
          {
            path: '/hr/payroll',
            element: guarded(<DynamicMenuRoute />, ['hr:payroll:list']),
          },
          {
            path: '/hr/ess/slips',
            element: guarded(<DynamicMenuRoute />, ['hr:ess:slip:view']),
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
            element: <DynamicMenuRoute />,
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
  [
    { path: '/portal/:tenantCode/login', element: withSuspense(<PortalPage key="portal-login" mode="login" />), errorElement: <ModernRouteErrorPage /> },
    { path: '/portal/:tenantCode/activate', element: withSuspense(<PortalPage key="portal-activate" mode="activate" />), errorElement: <ModernRouteErrorPage /> },
    { path: '/portal/:tenantCode', element: withSuspense(<PortalPage key="portal-session" mode="session" />), errorElement: <ModernRouteErrorPage /> },
    { path: '/portal/:tenantCode/knowledge', element: withSuspense(<PortalKnowledgePage />), errorElement: <ModernRouteErrorPage /> },
    { path: '/portal/:tenantCode/tickets', element: withSuspense(<PortalTicketPage />), errorElement: <ModernRouteErrorPage /> },
    { path: '/portal/:tenantCode/contracts', element: withSuspense(<PortalContractPage />), errorElement: <ModernRouteErrorPage /> },
    { path: '/portal/:tenantCode/finance', element: withSuspense(<PortalFinancePage />), errorElement: <ModernRouteErrorPage /> },
    ...(isMobile ? mobileRoutes : desktopRoutes),
  ],
);
