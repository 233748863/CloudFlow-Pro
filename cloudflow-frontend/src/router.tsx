import React, { Suspense } from "react";
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Navigate,
  useRouteError,
} from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGuard } from "@/components/RoleGuard";
import { PermissionRouteGuard } from "@/components/PermissionRouteGuard";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { isMobileDevice } from "@/utils/device";
import { logger } from "@/utils/logger";
import { MobileLayout } from "@/mobile/layouts/MobileLayout";

// Lazy load Mobile pages for better performance
const MobileDashboard = React.lazy(() =>
  import("@/mobile/pages/MobileDashboard").then((module) => ({
    default: module.MobileDashboard,
  })),
);
const MobileVehicleBooking = React.lazy(() =>
  import("@/mobile/pages/vehicle/MobileVehicleBooking").then((module) => ({
    default: module.MobileVehicleBooking,
  })),
);
const MobileProfile = React.lazy(() =>
  import("@/mobile/pages/MobileProfile").then((module) => ({
    default: module.MobileProfile,
  })),
);
const MobileMessages = React.lazy(() =>
  import("@/mobile/pages/MobileMessages").then((module) => ({
    default: module.MobileMessages,
  })),
);
const MobileTasks = React.lazy(() =>
  import("@/mobile/pages/MobileTasks").then((module) => ({
    default: module.MobileTasks,
  })),
);
const MobileSchedule = React.lazy(() =>
  import("@/mobile/pages/MobileSchedule").then((module) => ({
    default: module.MobileSchedule,
  })),
);
const MobileMeetingRoom = React.lazy(() =>
  import("@/mobile/pages/MobileMeetingRoom").then((module) => ({
    default: module.MobileMeetingRoom,
  })),
);
const MobileLeaveApplication = React.lazy(() =>
  import("@/mobile/pages/MobileLeaveApplication").then((module) => ({
    default: module.MobileLeaveApplication,
  })),
);
const MobileReimbursement = React.lazy(() =>
  import("@/mobile/pages/MobileReimbursement").then((module) => ({
    default: module.MobileReimbursement,
  })),
);
const MobileWorkflowMonitor = React.lazy(() =>
  import("@/mobile/pages/MobileWorkflowMonitor").then((module) => ({
    default: module.MobileWorkflowMonitor,
  })),
);

// Lazy load Desktop pages
const Dashboard = React.lazy(() =>
  import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })),
);
const Workplace = React.lazy(() =>
  import("./pages/Workplace").then((module) => ({ default: module.Workplace })),
);
const ProfilePage = React.lazy(() =>
  import("./pages/ProfilePage").then((module) => ({
    default: module.ProfilePage,
  })),
);
const TaskListPage = React.lazy(() =>
  import("./pages/TaskListPage").then((module) => ({
    default: module.TaskListPage,
  })),
);
const WorkflowDesign = React.lazy(() =>
  import("./pages/WorkflowDesign").then((module) => ({
    default: module.WorkflowDesign,
  })),
);
const WorkflowCreate = React.lazy(() =>
  import("./pages/WorkflowCreate").then((module) => ({
    default: module.WorkflowCreate,
  })),
);
const FormDesign = React.lazy(() =>
  import("./pages/FormDesign").then((module) => ({
    default: module.FormDesign,
  })),
);
const OrgStructurePage = React.lazy(() =>
  import("./pages/OrgStructurePage").then((module) => ({
    default: module.OrgStructurePage,
  })),
);
const CodeGeneration = React.lazy(() =>
  import("./pages/CodeGeneration").then((module) => ({
    default: module.CodeGeneration,
  })),
);
const UserList = React.lazy(() =>
  import("./pages/system/UserList").then((module) => ({
    default: module.UserList,
  })),
);
const RoleList = React.lazy(() =>
  import("./pages/system/RoleList").then((module) => ({
    default: module.RoleList,
  })),
);
const MenuList = React.lazy(() =>
  import("./pages/system/MenuList").then((module) => ({
    default: module.MenuList,
  })),
);
const FileList = React.lazy(() =>
  import("./pages/system/FileList").then((module) => ({
    default: module.FileList,
  })),
);
const TenantList = React.lazy(() =>
  import("./pages/system/TenantList").then((module) => ({
    default: module.TenantList,
  })),
);
const AnnouncementPage = React.lazy(() =>
  import("./pages/AnnouncementPage").then((module) => ({
    default: module.AnnouncementPage,
  })),
);
const SchedulePage = React.lazy(() =>
  import("./pages/SchedulePage").then((module) => ({
    default: module.SchedulePage,
  })),
);
const MeetingRoomPage = React.lazy(() =>
  import("./pages/MeetingRoomPage").then((module) => ({
    default: module.MeetingRoomPage,
  })),
);
const AssetList = React.lazy(() => import("./pages/admin/asset/AssetList"));
const VehicleList = React.lazy(
  () => import("./pages/admin/vehicle/VehicleList"),
);
const VehicleBooking = React.lazy(() =>
  import("@/pages/admin/vehicle/VehicleBooking").then((m) => ({
    default: m.VehicleBooking,
  })),
);
const VehicleUsageList = React.lazy(
  () => import("./pages/admin/vehicle/VehicleUsageList"),
);
const WorkflowMonitor = React.lazy(() =>
  import("./pages/WorkflowMonitor").then((module) => ({
    default: module.default,
  })),
);
const DeployManagement = React.lazy(() =>
  import("./pages/DeployManagement").then((module) => ({
    default: module.DeployManagement,
  })),
);
const AlertList = React.lazy(() => import("./pages/AlertList"));
const PerformanceStats = React.lazy(() => import("./pages/PerformanceStats"));
const ExpenseClaimPage = React.lazy(() => import("./pages/ExpenseClaimPage"));
const PaymentRequestPage = React.lazy(() =>
  import("./pages/PaymentRequestPage").then((module) => ({
    default: module.PaymentRequestPage,
  })),
);
const PurchaseRequestPage = React.lazy(() =>
  import("./pages/PurchaseRequestPage").then((module) => ({
    default: module.PurchaseRequestPage,
  })),
);
const CopyListPage = React.lazy(() =>
  import("./pages/CopyListPage").then((module) => ({
    default: module.CopyListPage,
  })),
);
const OperationLogPage = React.lazy(() =>
  import("./pages/system/OperationLogPage").then((module) => ({
    default: module.OperationLogPage,
  })),
);
const AuditLogPage = React.lazy(() =>
  import("./pages/system/AuditLogPage").then((module) => ({
    default: module.AuditLogPage,
  })),
);
const LoginLogPage = React.lazy(() =>
  import("./pages/system/LoginLogPage").then((module) => ({
    default: module.LoginLogPage,
  })),
);
const OnlineUserPage = React.lazy(() =>
  import("./pages/system/OnlineUserPage").then((module) => ({
    default: module.OnlineUserPage,
  })),
);

// OA 扩展页面
const BusinessTripPage = React.lazy(() => import("./pages/BusinessTripPage"));
const ContactPage = React.lazy(() => import("./pages/ContactPage"));
const KnowledgePage = React.lazy(() => import("./pages/KnowledgePage"));
const SealApplicationPage = React.lazy(() => import("./pages/SealApplicationPage"));
const LicenseBorrowPage = React.lazy(() => import("./pages/LicenseBorrowPage"));
const ContractPage = React.lazy(() => import("./pages/ContractPage"));
const ProjectManagementPage = React.lazy(() => import("./pages/ProjectManagementPage"));
const BudgetManagementPage = React.lazy(() => import("./pages/BudgetManagementPage"));
const InvoiceManagementPage = React.lazy(() => import("./pages/InvoiceManagementPage"));
const CrmManagementPage = React.lazy(() => import("./pages/CrmManagementPage"));
const CrmLeadPage = React.lazy(() => import("./pages/CrmLeadPage"));
const CrmProductPage = React.lazy(() => import("./pages/CrmProductPage"));
const CrmPriceBookPage = React.lazy(() => import("./pages/CrmPriceBookPage"));
const CrmSalesTargetPage = React.lazy(() => import("./pages/CrmSalesTargetPage"));
const CrmCustomerPoolPage = React.lazy(() => import("./pages/CrmCustomerPoolPage"));
const CrmAssignmentRulePage = React.lazy(() => import("./pages/CrmAssignmentRulePage"));
const CrmCustomerWorkspacePage = React.lazy(() => import("./pages/CrmCustomerWorkspacePage"));
const VisitorPage = React.lazy(() => import("./pages/VisitorPage"));
const DutySchedulePage = React.lazy(() => import("./pages/DutySchedulePage"));
const SupplierPage = React.lazy(() => import("./pages/admin/supplier/SupplierPage"));
const ConsumablePage = React.lazy(() => import("./pages/admin/consumable/ConsumablePage"));
const SealListPage = React.lazy(() => import("./pages/admin/seal-license/SealListPage"));
const LicenseListPage = React.lazy(() => import("./pages/admin/seal-license/LicenseListPage"));
const BorrowManagementPage = React.lazy(() => import("./pages/admin/seal-license/BorrowManagementPage"));
const RiskAlertPage = React.lazy(() => import("./pages/admin/RiskAlertPage"));
const DictPage = React.lazy(() => import("./pages/admin/DictPage"));
const ProcessCategoryPage = React.lazy(
  () => import("./pages/admin/ProcessCategoryPage"),
);
const PostList = React.lazy(() =>
  import("./pages/system/PostList").then((module) => ({
    default: module.PostList,
  })),
);
const ConfigList = React.lazy(() =>
  import("./pages/system/ConfigList").then((module) => ({
    default: module.ConfigList,
  })),
);
const BusinessRulePage = React.lazy(() =>
  import("./pages/system/BusinessRulePage").then((module) => ({
    default: module.BusinessRulePage,
  })),
);
const AuditEventPage = React.lazy(() =>
  import("./pages/system/AuditEventPage").then((module) => ({
    default: module.AuditEventPage,
  })),
);
const CacheMonitor = React.lazy(() =>
  import("./pages/system/CacheMonitor").then((module) => ({
    default: module.CacheMonitor,
  })),
);
const ProcessManagement = React.lazy(() =>
  import("./pages/admin/ProcessManagement").then((module) => ({
    default: module.ProcessManagement,
  })),
);
const WorkflowImport = React.lazy(() =>
  import("./pages/admin/WorkflowImport").then((module) => ({
    default: module.WorkflowImport,
  })),
);
const ArchivedWorkflows = React.lazy(() =>
  import("./pages/admin/ArchivedWorkflows").then((module) => ({
    default: module.ArchivedWorkflows,
  })),
);
const VersionHistoryPage = React.lazy(() =>
  import("./pages/VersionHistoryPage").then((module) => ({
    default: module.VersionHistoryPage,
  })),
);
const TemplateManagement = React.lazy(() =>
  import("./pages/admin/TemplateManagement").then((module) => ({
    default: module.TemplateManagement,
  })),
);
const TemplateLibrary = React.lazy(() =>
  import("./pages/TemplateLibrary").then((module) => ({
    default: module.TemplateLibrary,
  })),
);
const HrDashboardPage = React.lazy(() =>
  import("./pages/hr/HrDashboardPage").then((module) => ({
    default: module.default,
  })),
);
const HrEmployeePage = React.lazy(() =>
  import("./pages/hr/HrEmployeePage").then((module) => ({
    default: module.default,
  })),
);
const HrRecruitmentPage = React.lazy(() =>
  import("./pages/hr/HrRecruitmentPage").then((module) => ({
    default: module.default,
  })),
);
const HrOrganizationPage = React.lazy(() =>
  import("./pages/hr/HrOrganizationPage").then((module) => ({
    default: module.default,
  })),
);
const HrLifecyclePage = React.lazy(() =>
  import("./pages/hr/HrLifecyclePage").then((module) => ({
    default: module.default,
  })),
);
const HrAttendancePage = React.lazy(() =>
  import("./pages/hr/HrAttendancePage").then((module) => ({
    default: module.default,
  })),
);
const HrCompensationPage = React.lazy(() =>
  import("./pages/hr/HrCompensationPage").then((module) => ({
    default: module.default,
  })),
);
const HrPerformancePage = React.lazy(() =>
  import("./pages/hr/HrPerformancePage").then((module) => ({
    default: module.default,
  })),
);

const Loading = () => (
  <div className="flex h-full min-h-[400px] w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-600 dark:border-slate-800 dark:border-t-cyan-400"></div>
  </div>
);

const crmManagementRouteElement = (permissions: string[]) => (
  <PermissionRouteGuard permissions={permissions}>
    <Suspense fallback={<Loading />}>
      <CrmManagementPage />
    </Suspense>
  </PermissionRouteGuard>
);

interface RouteStatusPageProps {
  code: string;
  title: string;
  description: string;
}

const RouteStatusPage = ({
  code,
  title,
  description,
}: RouteStatusPageProps) => (
  <div className="flex min-h-[60vh] items-center justify-center bg-slate-50/80 px-6 py-12 dark:bg-slate-950/70">
    <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.2)] dark:border-slate-800 dark:bg-slate-950">
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.12),_transparent_40%),linear-gradient(135deg,_rgba(248,250,252,0.98),_rgba(255,255,255,0.92))] px-8 py-10 dark:bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_38%),linear-gradient(135deg,_rgba(2,6,23,0.96),_rgba(15,23,42,0.92))]">
        <div className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-600 dark:text-cyan-300">
          {code}
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-400">
          {description}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            返回上一页
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(13,148,136,0.22)] transition hover:from-cyan-500 hover:to-teal-500 dark:shadow-[0_12px_24px_rgba(6,182,212,0.18)]"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  </div>
);

const RouteErrorPage = () => {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const description =
      error.status === 404
        ? "当前地址没有对应页面，请返回首页或使用最新菜单重新进入。"
        : error.statusText || "路由资源加载失败，请稍后重试。";

    return (
      <RouteStatusPage
        code={String(error.status)}
        title={error.status === 404 ? "页面不存在" : "页面加载失败"}
        description={description}
      />
    );
  }

  return (
    <RouteStatusPage
      code="500"
      title="页面加载失败"
      description={
        error instanceof Error
          ? error.message
          : "发生了未知错误，请稍后重试。"
      }
    />
  );
};

const RouteNotFoundPage = () => (
  <RouteStatusPage
    code="404"
    title="页面不存在"
    description="这个地址在当前版本中没有对应页面，请返回首页后重新访问。"
  />
);

const ModernRouteStatusPage = ({
  code,
  title,
  description,
}: RouteStatusPageProps) => (
  <div className="flex min-h-[60vh] items-center justify-center bg-slate-50/80 px-6 py-12 dark:bg-slate-950/70">
    <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.2)] dark:border-slate-800 dark:bg-slate-950">
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.12),_transparent_40%),linear-gradient(135deg,_rgba(248,250,252,0.98),_rgba(255,255,255,0.92))] px-8 py-10 dark:bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_38%),linear-gradient(135deg,_rgba(2,6,23,0.96),_rgba(15,23,42,0.92))]">
        <div className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-600 dark:text-cyan-300">
          {code}
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-400">
          {description}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            返回上一页
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(13,148,136,0.22)] transition hover:from-cyan-500 hover:to-teal-500 dark:shadow-[0_12px_24px_rgba(6,182,212,0.18)]"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  </div>
);

const ModernRouteErrorPage = () => {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <ModernRouteStatusPage
        code={String(error.status)}
        title={error.status === 404 ? "页面不存在" : "页面加载失败"}
        description={
          error.status === 404
            ? "当前地址没有对应页面，请返回首页或使用最新菜单重新进入。"
            : error.statusText || "路由资源加载失败，请稍后重试。"
        }
      />
    );
  }

  return (
    <ModernRouteStatusPage
      code="500"
      title="页面加载失败"
      description={error instanceof Error ? error.message : "发生了未知错误，请稍后重试。"}
    />
  );
};

const ModernRouteNotFoundPage = () => (
  <ModernRouteStatusPage
    code="404"
    title="页面不存在"
    description="这个地址在当前版本中没有对应页面，请返回首页后重新访问。"
  />
);

// --- Desktop Routes (Unchanged) ---
const desktopRoutes = [
  {
    path: "/login",
    element: <Login />,
    errorElement: <ModernRouteErrorPage />,
  },
  {
    path: "/register",
    element: <Register />,
    errorElement: <ModernRouteErrorPage />,
  },
  {
    element: <ProtectedRoute />,
    errorElement: <ModernRouteErrorPage />,
    children: [
      {
        element: <MainLayout />,
        errorElement: <ModernRouteErrorPage />,
        children: [
          {
            path: "/",
            element: (
              <Suspense fallback={<Loading />}>
                <Dashboard />
              </Suspense>
            ),
          },
          {
            path: "/workplace",
            element: (
              <Suspense fallback={<Loading />}>
                <Workplace />
              </Suspense>
            ),
          },
          {
            path: "/profile",
            element: (
              <Suspense fallback={<Loading />}>
                <ProfilePage />
              </Suspense>
            ),
          },
          {
            path: "/tasks",
            element: (
              <Suspense fallback={<Loading />}>
                <TaskListPage type="pending" />
              </Suspense>
            ),
          },
          {
            path: "/announcement",
            element: (
              <PermissionRouteGuard permissions={["office:announcement"]}>
                <Suspense fallback={<Loading />}>
                  <AnnouncementPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/announcement",
            element: (
              <PermissionRouteGuard permissions={["office:announcement"]}>
                <Suspense fallback={<Loading />}>
                  <AnnouncementPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/schedule",
            element: (
              <PermissionRouteGuard permissions={["workspace:schedule"]}>
                <Suspense fallback={<Loading />}>
                  <SchedulePage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/meeting-room",
            element: (
              <PermissionRouteGuard permissions={["office:meeting"]}>
                <Suspense fallback={<Loading />}>
                  <MeetingRoomPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/my-apps",
            element: (
              <Suspense fallback={<Loading />}>
                <TaskListPage type="applications" />
              </Suspense>
            ),
          },
          {
            path: "/my-copies",
            element: (
              <Suspense fallback={<Loading />}>
                <CopyListPage />
              </Suspense>
            ),
          },
          {
            path: "/workflow",
            element: (
              <RoleGuard allowedRoles={["ADMIN", "admin"]}>
                <Suspense fallback={<Loading />}>
                  <WorkflowCreate />
                </Suspense>
              </RoleGuard>
            ),
          },
          {
            path: "/workflow/create",
            element: (
              <RoleGuard allowedRoles={["ADMIN", "admin"]}>
                <Suspense fallback={<Loading />}>
                  <WorkflowCreate />
                </Suspense>
              </RoleGuard>
            ),
          },
          {
            path: "/workflow/design",
            element: (
              <RoleGuard allowedRoles={["ADMIN", "admin"]}>
                <Suspense fallback={<Loading />}>
                  <WorkflowDesign />
                </Suspense>
              </RoleGuard>
            ),
          },
          {
            path: "/workflow/monitor",
            element: (
              <Suspense fallback={<Loading />}>
                <WorkflowMonitor />
              </Suspense>
            ),
          },
          {
            path: "/workflow/deploy",
            element: (
              <Suspense fallback={<Loading />}>
                <DeployManagement />
              </Suspense>
            ),
          },
          {
            path: "/workflow/alerts",
            element: (
              <Suspense fallback={<Loading />}>
                <AlertList />
              </Suspense>
            ),
          },
          {
            path: "/workflow/performance",
            element: (
              <Suspense fallback={<Loading />}>
                <PerformanceStats />
              </Suspense>
            ),
          },
          {
            path: "/forms",
            element: (
              <RoleGuard allowedRoles={["ADMIN", "admin"]}>
                <Suspense fallback={<Loading />}>
                  <FormDesign />
                </Suspense>
              </RoleGuard>
            ),
          },
          {
            path: "/users",
            element: (
              <Suspense fallback={<Loading />}>
                <OrgStructurePage />
              </Suspense>
            ),
          },
          {
            path: "/code",
            element: (
              <Suspense fallback={<Loading />}>
                <CodeGeneration />
              </Suspense>
            ),
          },
          {
            path: "/system/users",
            element: (
              <Suspense fallback={<Loading />}>
                <UserList />
              </Suspense>
            ),
          },
          {
            path: "/system/roles",
            element: (
              <PermissionRouteGuard permissions={["system:role:list"]}>
                <Suspense fallback={<Loading />}>
                  <RoleList />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/system/menus",
            element: (
              <Suspense fallback={<Loading />}>
                <MenuList />
              </Suspense>
            ),
          },
          {
            path: "/system/files",
            element: (
              <Suspense fallback={<Loading />}>
                <FileList />
              </Suspense>
            ),
          },
          {
            path: "/system/tenant",
            element: (
              <Suspense fallback={<Loading />}>
                <TenantList />
              </Suspense>
            ),
          },


          {
            path: "/admin/asset",
            element: (
              <PermissionRouteGuard permissions={["admin:asset:list"]}>
                <Suspense fallback={<Loading />}>
                  <AssetList />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/vehicle",
            element: <Navigate to="/admin/vehicle/list" replace />,
          },
          {
            path: "/admin/vehicle/list",
            element: (
              <PermissionRouteGuard permissions={["admin:vehicle:list"]}>
                <Suspense fallback={<Loading />}>
                  <VehicleList />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/vehicle/booking",
            element: (
              <PermissionRouteGuard permissions={["admin:vehicle:booking"]}>
                <Suspense fallback={<Loading />}>
                  <VehicleBooking />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/vehicle/usage",
            element: (
              <PermissionRouteGuard permissions={["admin:vehicle:usage"]}>
                <Suspense fallback={<Loading />}>
                  <VehicleUsageList />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/expense/claim",
            element: (
              <PermissionRouteGuard permissions={["office:expense:list"]}>
                <Suspense fallback={<Loading />}>
                  <ExpenseClaimPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/payment/request",
            element: (
              <PermissionRouteGuard permissions={["office:payment:list"]}>
                <Suspense fallback={<Loading />}>
                  <PaymentRequestPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/purchase-request",
            element: (
              <PermissionRouteGuard permissions={["office:purchase:list"]}>
                <Suspense fallback={<Loading />}>
                  <PurchaseRequestPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/seal-application",
            element: (
              <PermissionRouteGuard permissions={["office:seal:list"]}>
                <Suspense fallback={<Loading />}>
                  <SealApplicationPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/license-borrow",
            element: (
              <PermissionRouteGuard permissions={["office:license:list"]}>
                <Suspense fallback={<Loading />}>
                  <LicenseBorrowPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/contracts",
            element: (
              <PermissionRouteGuard permissions={["office:contract:list"]}>
                <Suspense fallback={<Loading />}>
                  <ContractPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/project",
            element: (
              <PermissionRouteGuard permissions={["office:project:list"]}>
                <Suspense fallback={<Loading />}>
                  <ProjectManagementPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/project-wbs",
            element: (
              <PermissionRouteGuard permissions={["admin:project:wbs", "office:project:wbs"]}>
                <Suspense fallback={<Loading />}>
                  <ProjectManagementPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/budget",
            element: (
              <PermissionRouteGuard permissions={["office:budget:list"]}>
                <Suspense fallback={<Loading />}>
                  <BudgetManagementPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/invoice",
            element: (
              <PermissionRouteGuard permissions={["office:invoice:list"]}>
                <Suspense fallback={<Loading />}>
                  <InvoiceManagementPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/crm",
            element: crmManagementRouteElement(["crm:dashboard:view", "crm:customer:list", "crm:opportunity:list", "crm:quote:list", "crm:receivable:list", "crm:renewal:list", "crm:ticket:list"]),
          },
          {
            path: "/office/crm/customers",
            element: crmManagementRouteElement(["crm:dashboard:view", "crm:customer:list", "crm:opportunity:list", "crm:quote:list", "crm:receivable:list", "crm:renewal:list", "crm:ticket:list"]),
          },
          {
            path: "/office/crm/opportunities",
            element: crmManagementRouteElement(["crm:dashboard:view", "crm:customer:list", "crm:opportunity:list", "crm:quote:list", "crm:receivable:list", "crm:renewal:list", "crm:ticket:list"]),
          },
          {
            path: "/office/crm/quotes",
            element: crmManagementRouteElement(["crm:dashboard:view", "crm:customer:list", "crm:opportunity:list", "crm:quote:list", "crm:receivable:list", "crm:renewal:list", "crm:ticket:list"]),
          },
          {
            path: "/office/crm/receivables",
            element: crmManagementRouteElement(["crm:dashboard:view", "crm:customer:list", "crm:opportunity:list", "crm:quote:list", "crm:receivable:list", "crm:renewal:list", "crm:ticket:list"]),
          },
          {
            path: "/office/crm/renewals",
            element: crmManagementRouteElement(["crm:dashboard:view", "crm:customer:list", "crm:opportunity:list", "crm:quote:list", "crm:receivable:list", "crm:renewal:list", "crm:ticket:list"]),
          },
          {
            path: "/office/crm/tickets",
            element: crmManagementRouteElement(["crm:dashboard:view", "crm:customer:list", "crm:opportunity:list", "crm:quote:list", "crm:receivable:list", "crm:renewal:list", "crm:ticket:list"]),
          },
          {
            path: "/office/crm/leads",
            element: (
              <PermissionRouteGuard permissions={["crm:lead:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmLeadPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/crm/products",
            element: (
              <PermissionRouteGuard permissions={["crm:product:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmProductPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/crm/price-books",
            element: (
              <PermissionRouteGuard permissions={["crm:price-book:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmPriceBookPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/crm/sales-targets",
            element: (
              <PermissionRouteGuard permissions={["crm:sales-target:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmSalesTargetPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/crm/customer-pool",
            element: (
              <PermissionRouteGuard permissions={["crm:customer-pool:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmCustomerPoolPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/crm/assignment-rules",
            element: (
              <PermissionRouteGuard permissions={["crm:assignment-rule:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmAssignmentRulePage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/crm/customer/:customerId",
            element: (
              <PermissionRouteGuard permissions={["crm:customer:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmCustomerWorkspacePage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/system/log",
            element: (
              <Suspense fallback={<Loading />}>
                <OperationLogPage />
              </Suspense>
            ),
          },
          {
            path: "/system/audit-log",
            element: (
              <Suspense fallback={<Loading />}>
                <AuditLogPage />
              </Suspense>
            ),
          },
          {
            path: "/system/login-log",
            element: (
              <Suspense fallback={<Loading />}>
                <LoginLogPage />
              </Suspense>
            ),
          },
          {
            path: "/system/online",
            element: (
              <Suspense fallback={<Loading />}>
                <OnlineUserPage />
              </Suspense>
            ),
          },
          // === HR 假勤与 OA 扩展模块路由 ===
          // HR 假勤路由



          // OA 扩展路由
          {
            path: "/office/business-trip",
            element: (
              <PermissionRouteGuard permissions={["office:trip:list"]}>
                <Suspense fallback={<Loading />}>
                  <BusinessTripPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/contact",
            element: (
              <PermissionRouteGuard permissions={["office:contact:list"]}>
                <Suspense fallback={<Loading />}>
                  <ContactPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/office/knowledge",
            element: (
              <PermissionRouteGuard permissions={["office:knowledge:list"]}>
                <Suspense fallback={<Loading />}>
                  <KnowledgePage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/visitor",
            element: (
              <PermissionRouteGuard permissions={["admin:visitor:list"]}>
                <Suspense fallback={<Loading />}>
                  <VisitorPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/duty-schedule",
            element: (
              <PermissionRouteGuard permissions={["admin:duty:list"]}>
                <Suspense fallback={<Loading />}>
                  <DutySchedulePage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/supplier",
            element: (
              <PermissionRouteGuard permissions={["admin:supplier:list"]}>
                <Suspense fallback={<Loading />}>
                  <SupplierPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/consumable",
            element: (
              <PermissionRouteGuard permissions={["admin:consumable:list"]}>
                <Suspense fallback={<Loading />}>
                  <ConsumablePage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/seal",
            element: (
              <PermissionRouteGuard permissions={["admin:seal:list"]}>
                <Suspense fallback={<Loading />}>
                  <SealListPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/license",
            element: (
              <PermissionRouteGuard permissions={["admin:license:list"]}>
                <Suspense fallback={<Loading />}>
                  <LicenseListPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/borrow-management",
            element: (
              <PermissionRouteGuard permissions={["admin:borrow:list"]}>
                <Suspense fallback={<Loading />}>
                  <BorrowManagementPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/admin/risk-alerts",
            element: (
              <PermissionRouteGuard permissions={["admin:risk:list"]}>
                <Suspense fallback={<Loading />}>
                  <RiskAlertPage />
                </Suspense>
              </PermissionRouteGuard>
            ),
          },
          {
            path: "/system/dict",
            element: (
              <Suspense fallback={<Loading />}>
                <DictPage />
              </Suspense>
            ),
          },
          {
            path: "/workflow/category",
            element: (
              <Suspense fallback={<Loading />}>
                <ProcessCategoryPage />
              </Suspense>
            ),
          },
          {
            path: "/workflow/management",
            element: (
              <Suspense fallback={<Loading />}>
                <ProcessManagement />
              </Suspense>
            ),
          },
          {
            path: "/workflow/import",
            element: (
              <Suspense fallback={<Loading />}>
                <WorkflowImport />
              </Suspense>
            ),
          },
          {
            path: "/workflow/archived",
            element: (
              <Suspense fallback={<Loading />}>
                <ArchivedWorkflows />
              </Suspense>
            ),
          },
          {
            path: "/workflow/versions/:workflowId",
            element: (
              <Suspense fallback={<Loading />}>
                <VersionHistoryPage />
              </Suspense>
            ),
          },
          {
            path: "/templates/manage",
            element: (
              <RoleGuard allowedRoles={["ADMIN", "admin"]}>
                <Suspense fallback={<Loading />}>
                  <TemplateManagement />
                </Suspense>
              </RoleGuard>
            ),
          },
          {
            path: "/templates",
            element: (
              <Suspense fallback={<Loading />}>
                <TemplateLibrary />
              </Suspense>
            ),
          },
          {
            path: "/hr",
            element: <Navigate to="/hr/dashboard" replace />,
          },
          {
            path: "/hr/dashboard",
            element: (
              <Suspense fallback={<Loading />}>
                <HrDashboardPage />
              </Suspense>
            ),
          },
          {
            path: "/hr/employees",
            element: (
              <Suspense fallback={<Loading />}>
                <HrEmployeePage />
              </Suspense>
            ),
          },
          {
            path: "/hr/recruitment",
            element: (
              <Suspense fallback={<Loading />}>
                <HrRecruitmentPage />
              </Suspense>
            ),
          },
          {
            path: "/hr/organization",
            element: (
              <Suspense fallback={<Loading />}>
                <HrOrganizationPage />
              </Suspense>
            ),
          },
          {
            path: "/hr/lifecycle",
            element: (
              <Suspense fallback={<Loading />}>
                <HrLifecyclePage />
              </Suspense>
            ),
          },
          {
            path: "/hr/attendance",
            element: (
              <Suspense fallback={<Loading />}>
                <HrAttendancePage />
              </Suspense>
            ),
          },
          {
            path: "/hr/compensation",
            element: (
              <Suspense fallback={<Loading />}>
                <HrCompensationPage />
              </Suspense>
            ),
          },
          {
            path: "/hr/performance",
            element: (
              <Suspense fallback={<Loading />}>
                <HrPerformancePage />
              </Suspense>
            ),
          },
          // === 新增系统管理路由 ===
          {
            path: "/system/post",
            element: (
              <Suspense fallback={<Loading />}>
                <PostList />
              </Suspense>
            ),
          },
          {
            path: "/system/config",
            element: (
              <Suspense fallback={<Loading />}>
                <ConfigList />
              </Suspense>
            ),
          },
          {
            path: "/system/rules",
            element: (
              <Suspense fallback={<Loading />}>
                <BusinessRulePage />
              </Suspense>
            ),
          },
          {
            path: "/system/audit-events",
            element: (
              <Suspense fallback={<Loading />}>
                <AuditEventPage />
              </Suspense>
            ),
          },
          {
            path: "/system/cache",
            element: (
              <Suspense fallback={<Loading />}>
                <CacheMonitor />
              </Suspense>
            ),
          },
          // 统一兜底，避免 React Router 默认 404 错误页直接暴露给用户。
          {
            path: "*",
            element: <ModernRouteNotFoundPage />,
          },
        ],
      },
    ],
  },
];

// --- Mobile Routes (New) ---
const mobileRoutes = [
  {
    path: "/login",
    element: <Login />, // Can be replaced with MobileLogin if needed
    errorElement: <ModernRouteErrorPage />,
  },
  {
    element: <ProtectedRoute />,
    errorElement: <ModernRouteErrorPage />,
    children: [
      {
        element: <MobileLayout />,
        errorElement: <ModernRouteErrorPage />,
        children: [
          {
            path: "/",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileDashboard />
              </Suspense>
            ),
          },
          {
            path: "/vehicle/booking",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileVehicleBooking />
              </Suspense>
            ),
          },
          {
            path: "/profile",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileProfile />
              </Suspense>
            ),
          },
          {
            path: "/messages",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileMessages />
              </Suspense>
            ),
          },
          {
            path: "/tasks",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileTasks />
              </Suspense>
            ),
          },
          {
            path: "/schedule",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileSchedule />
              </Suspense>
            ),
          },
          {
            path: "/meeting-room",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileMeetingRoom />
              </Suspense>
            ),
          },

          {
            path: "/reimbursement/request",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileReimbursement />
              </Suspense>
            ),
          },
          {
            path: "/workflow/monitor",
            element: (
              <Suspense fallback={<Loading />}>
                <MobileWorkflowMonitor />
              </Suspense>
            ),
          },
          // Fallback for not-yet-implemented mobile pages
          {
            path: "*",
            element: (
              <div className="p-4 text-center text-gray-500 mt-20">
                此功能暂不支持移动端，请在电脑访问。
              </div>
            ),
          },
        ],
      },
    ],
  },
];

// --- Router Factory ---
// Determine which router to use based on device type
const isMobile = isMobileDevice();
logger.log("Device Detection:", isMobile ? "Mobile" : "Desktop");

export const router = createBrowserRouter(
  isMobile ? mobileRoutes : desktopRoutes,
);
