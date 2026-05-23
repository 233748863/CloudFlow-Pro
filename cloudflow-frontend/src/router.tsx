import React, { Suspense } from "react";
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Navigate,
  Outlet,
  useRouteError,
} from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { RouteGuard } from "@/components/common/RouteGuard";
import { Role } from "@/types";
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
const MeetingMinutesPage = React.lazy(() => import("./pages/MeetingMinutesPage"));
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
const ApiRateLimitPage = React.lazy(() =>
  import("./pages/system/ApiRateLimitPage").then((module) => ({
    default: module.ApiRateLimitPage,
  })),
);
const IpAclPage = React.lazy(() =>
  import("./pages/system/IpAclPage").then((module) => ({
    default: module.IpAclPage,
  })),
);
const UserBlacklistPage = React.lazy(() =>
  import("./pages/system/UserBlacklistPage").then((module) => ({
    default: module.UserBlacklistPage,
  })),
);
const ContractThresholdPage = React.lazy(() =>
  import("./pages/oa/ContractThresholdPage").then((module) => ({
    default: module.ContractThresholdPage,
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
const HrAttendanceAppealPage = React.lazy(() =>
  import("./pages/hr/HrAttendanceAppealPage").then((module) => ({
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
const HrEssPortalPage = React.lazy(() =>
  import("./pages/hr/HrEssPortalPage").then((module) => ({
    default: module.default,
  })),
);
const HrEssSalarySlipPage = React.lazy(() =>
  import("./pages/hr/ess/HrEssSalarySlipPage").then((module) => ({
    default: module.default,
  })),
);
const HrEssCertificatePage = React.lazy(() =>
  import("./pages/hr/ess/HrEssCertificatePage").then((module) => ({
    default: module.default,
  })),
);
const HrEssProfilePage = React.lazy(() =>
  import("./pages/hr/ess/HrEssProfilePage").then((module) => ({
    default: module.default,
  })),
);
const HrEssLeaveBalancePage = React.lazy(() =>
  import("./pages/hr/ess/HrEssLeaveBalancePage").then((module) => ({
    default: module.default,
  })),
);
const HrEssBenefitPage = React.lazy(() =>
  import("./pages/hr/ess/HrEssBenefitPage").then((module) => ({
    default: module.default,
  })),
);
const HrEssContractPage = React.lazy(() =>
  import("./pages/hr/ess/HrEssContractPage").then((module) => ({
    default: module.default,
  })),
);
const HrTrainingPlanPage = React.lazy(() =>
  import("./pages/hr/HrTrainingPlanPage").then((module) => ({
    default: module.default,
  })),
);
const HrTrainingCoursePage = React.lazy(() =>
  import("./pages/hr/HrTrainingCoursePage").then((module) => ({
    default: module.default,
  })),
);
const HrTrainingSessionPage = React.lazy(() =>
  import("./pages/hr/HrTrainingSessionPage").then((module) => ({
    default: module.default,
  })),
);
const HrTrainingEnrollmentPage = React.lazy(() =>
  import("./pages/hr/HrTrainingEnrollmentPage").then((module) => ({
    default: module.default,
  })),
);
const HrTrainingExamPage = React.lazy(() =>
  import("./pages/hr/HrTrainingExamPage").then((module) => ({
    default: module.default,
  })),
);
const HrTrainingCertificatePage = React.lazy(() =>
  import("./pages/hr/HrTrainingCertificatePage").then((module) => ({
    default: module.default,
  })),
);
const HrTrainingArchivePage = React.lazy(() =>
  import("./pages/hr/HrTrainingArchivePage").then((module) => ({
    default: module.default,
  })),
);
const HrTalentDashboardPage = React.lazy(() =>
  import("./pages/hr/talent/HrTalentDashboardPage").then((module) => ({
    default: module.default,
  })),
);
const HrTalentReviewPage = React.lazy(() =>
  import("./pages/hr/talent/HrTalentReviewPage").then((module) => ({
    default: module.default,
  })),
);
const HrTalentNineBoxPage = React.lazy(() =>
  import("./pages/hr/talent/HrTalentNineBoxPage").then((module) => ({
    default: module.default,
  })),
);
const HrTalentCalibrationPage = React.lazy(() =>
  import("./pages/hr/talent/HrTalentCalibrationPage").then((module) => ({
    default: module.default,
  })),
);
const HrTalentSuccessionPage = React.lazy(() =>
  import("./pages/hr/talent/HrTalentSuccessionPage").then((module) => ({
    default: module.default,
  })),
);
const HrTalentPoolPage = React.lazy(() =>
  import("./pages/hr/talent/HrTalentPoolPage").then((module) => ({
    default: module.default,
  })),
);
const HrTalentDevelopmentPage = React.lazy(() =>
  import("./pages/hr/talent/HrTalentDevelopmentPage").then((module) => ({
    default: module.default,
  })),
);
const HrTalentArchivePage = React.lazy(() =>
  import("./pages/hr/talent/HrTalentArchivePage").then((module) => ({
    default: module.default,
  })),
);
const HrBenefitMinePage = React.lazy(() =>
  import("./pages/hr/benefit/HrBenefitMinePage").then((m) => ({ default: m.default })),
);
const HrBenefitRequestPage = React.lazy(() =>
  import("./pages/hr/benefit/HrBenefitRequestPage").then((m) => ({ default: m.default })),
);
const HrPointAccountPage = React.lazy(() =>
  import("./pages/hr/benefit/HrPointAccountPage").then((m) => ({ default: m.default })),
);
const HrMallPage = React.lazy(() =>
  import("./pages/hr/benefit/HrMallPage").then((m) => ({ default: m.default })),
);
const HrMallOrderPage = React.lazy(() =>
  import("./pages/hr/benefit/HrMallOrderPage").then((m) => ({ default: m.default })),
);
const HrMallItemAdminPage = React.lazy(() =>
  import("./pages/hr/benefit/HrMallItemAdminPage").then((m) => ({ default: m.default })),
);
const HrWorkInjuryPage = React.lazy(() =>
  import("./pages/hr/laborRelation/HrWorkInjuryPage").then((m) => ({ default: m.default })),
);
const HrWorkInjuryInvestigationPage = React.lazy(() =>
  import("./pages/hr/laborRelation/HrWorkInjuryInvestigationPage").then((m) => ({ default: m.default })),
);
const HrWorkInjuryTreatmentPage = React.lazy(() =>
  import("./pages/hr/laborRelation/HrWorkInjuryTreatmentPage").then((m) => ({ default: m.default })),
);
const HrWorkInjuryCompensationPage = React.lazy(() =>
  import("./pages/hr/laborRelation/HrWorkInjuryCompensationPage").then((m) => ({ default: m.default })),
);
const HrWorkInjuryRehabilitationPage = React.lazy(() =>
  import("./pages/hr/laborRelation/HrWorkInjuryRehabilitationPage").then((m) => ({ default: m.default })),
);
const HrLaborDisputePage = React.lazy(() =>
  import("./pages/hr/laborRelation/HrLaborDisputePage").then((m) => ({ default: m.default })),
);
const HrDisputeMediationPage = React.lazy(() =>
  import("./pages/hr/laborRelation/HrDisputeMediationPage").then((m) => ({ default: m.default })),
);
const HrDisputeArbitrationPage = React.lazy(() =>
  import("./pages/hr/laborRelation/HrDisputeArbitrationPage").then((m) => ({ default: m.default })),
);

const Loading = () => (
  <div className="flex h-full min-h-[400px] w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-600 dark:border-slate-800 dark:border-t-cyan-400"></div>
  </div>
);

const crmManagementRouteElement = (permissions: string[]) => (
  <RouteGuard requiredPermissions={permissions}>
    <Suspense fallback={<Loading />}>
      <CrmManagementPage />
    </Suspense>
  </RouteGuard>
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
            path: "/",
            element: (
              <RouteGuard requiredPermissions={["oa:workplace:view"]}>
                <Suspense fallback={<Loading />}>
                  <Dashboard />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workplace",
            element: (
              <RouteGuard requiredPermissions={["oa:workplace:view"]}>
                <Suspense fallback={<Loading />}>
                  <Workplace />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/profile",
            element: (
              <RouteGuard requiredPermissions={["system:user:profile:view"]}>
                <Suspense fallback={<Loading />}>
                  <ProfilePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/tasks",
            element: (
              <RouteGuard requiredPermissions={["workflow:task:todo"]}>
                <Suspense fallback={<Loading />}>
                  <TaskListPage type="pending" />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/announcement",
            element: (
              <RouteGuard requiredPermissions={["oa:announcement:list"]}>
                <Suspense fallback={<Loading />}>
                  <AnnouncementPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/announcement",
            element: (
              <RouteGuard requiredPermissions={["oa:announcement:list"]}>
                <Suspense fallback={<Loading />}>
                  <AnnouncementPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/schedule",
            element: (
              <RouteGuard requiredPermissions={["oa:schedule:list"]}>
                <Suspense fallback={<Loading />}>
                  <SchedulePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/meeting-room",
            element: (
              <RouteGuard requiredPermissions={["oa:meeting-room:list"]}>
                <Suspense fallback={<Loading />}>
                  <MeetingRoomPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/my-apps",
            element: (
              <RouteGuard requiredPermissions={["workflow:process:mine"]}>
                <Suspense fallback={<Loading />}>
                  <TaskListPage type="applications" />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/my-copies",
            element: (
              <RouteGuard requiredPermissions={["workflow:copy:list"]}>
                <Suspense fallback={<Loading />}>
                  <CopyListPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow",
            element: (
              <RouteGuard requiredPermissions={["workflow:process:start"]}>
                <Suspense fallback={<Loading />}>
                  <WorkflowCreate />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/create",
            element: (
              <RouteGuard requiredPermissions={["workflow:process:start"]}>
                <Suspense fallback={<Loading />}>
                  <WorkflowCreate />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/design",
            element: (
              <RouteGuard requiredPermissions={["workflow:definition:list"]}>
                <Suspense fallback={<Loading />}>
                  <WorkflowDesign />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/monitor",
            element: (
              <RouteGuard requiredPermissions={["workflow:monitor:list"]}>
                <Suspense fallback={<Loading />}>
                  <WorkflowMonitor />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/deploy",
            element: (
              <RouteGuard requiredPermissions={["workflow:deploy:list"]}>
                <Suspense fallback={<Loading />}>
                  <DeployManagement />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/alerts",
            element: (
              <RouteGuard requiredPermissions={["workflow:alert:list"]}>
                <Suspense fallback={<Loading />}>
                  <AlertList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/performance",
            element: (
              <RouteGuard requiredPermissions={["workflow:performance:view"]}>
                <Suspense fallback={<Loading />}>
                  <PerformanceStats />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/forms",
            element: (
              <RouteGuard requiredPermissions={["workflow:form:list"]}>
                <Suspense fallback={<Loading />}>
                  <FormDesign />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/users",
            element: (
              <RouteGuard requiredPermissions={["system:dept:list"]}>
                <Suspense fallback={<Loading />}>
                  <OrgStructurePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/code",
            element: (
              <RouteGuard requiredPermissions={["system:code:list"]}>
                <Suspense fallback={<Loading />}>
                  <CodeGeneration />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/users",
            element: (
              <RouteGuard requiredPermissions={["system:user:list"]}>
                <Suspense fallback={<Loading />}>
                  <UserList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/roles",
            element: (
              <RouteGuard requiredPermissions={["system:role:list"]}>
                <Suspense fallback={<Loading />}>
                  <RoleList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/menus",
            element: (
              <RouteGuard requiredPermissions={["system:menu:list"]}>
                <Suspense fallback={<Loading />}>
                  <MenuList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/files",
            element: (
              <RouteGuard requiredPermissions={["system:file:list"]}>
                <Suspense fallback={<Loading />}>
                  <FileList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/tenant",
            element: (
              <RouteGuard requiredPermissions={["system:tenant:list"]}>
                <Suspense fallback={<Loading />}>
                  <TenantList />
                </Suspense>
              </RouteGuard>
            ),
          },


          {
            path: "/admin/asset",
            element: (
              <RouteGuard requiredPermissions={["oa:asset:list"]}>
                <Suspense fallback={<Loading />}>
                  <AssetList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/vehicle",
            element: <Navigate to="/admin/vehicle/list" replace />,
          },
          {
            path: "/admin/vehicle/list",
            element: (
              <RouteGuard requiredPermissions={["oa:vehicle:list"]}>
                <Suspense fallback={<Loading />}>
                  <VehicleList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/vehicle/booking",
            element: (
              <RouteGuard requiredPermissions={["oa:vehicle:booking"]}>
                <Suspense fallback={<Loading />}>
                  <VehicleBooking />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/vehicle/usage",
            element: (
              <RouteGuard requiredPermissions={["oa:vehicle:usage"]}>
                <Suspense fallback={<Loading />}>
                  <VehicleUsageList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/expense/claim",
            element: (
              <RouteGuard requiredPermissions={["oa:expense:list"]}>
                <Suspense fallback={<Loading />}>
                  <ExpenseClaimPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/payment/request",
            element: (
              <RouteGuard requiredPermissions={["oa:payment:list"]}>
                <Suspense fallback={<Loading />}>
                  <PaymentRequestPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/purchase-request",
            element: (
              <RouteGuard requiredPermissions={["oa:purchase:list"]}>
                <Suspense fallback={<Loading />}>
                  <PurchaseRequestPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/seal-application",
            element: (
              <RouteGuard requiredPermissions={["oa:seal:list"]}>
                <Suspense fallback={<Loading />}>
                  <SealApplicationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/license-borrow",
            element: (
              <RouteGuard requiredPermissions={["oa:license:list"]}>
                <Suspense fallback={<Loading />}>
                  <LicenseBorrowPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/contracts",
            element: (
              <RouteGuard requiredPermissions={["oa:contract:list"]}>
                <Suspense fallback={<Loading />}>
                  <ContractPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/meeting-minutes",
            element: (
              <RouteGuard requiredPermissions={["oa:meeting:list"]}>
                <Suspense fallback={<Loading />}>
                  <MeetingMinutesPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/project",
            element: (
              <RouteGuard requiredPermissions={["oa:project:list"]}>
                <Suspense fallback={<Loading />}>
                  <ProjectManagementPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/project-wbs",
            element: (
              <RouteGuard requiredPermissions={["oa:project:wbs", "oa:project:wbs"]}>
                <Suspense fallback={<Loading />}>
                  <ProjectManagementPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/budget",
            element: (
              <RouteGuard requiredPermissions={["oa:budget:list"]}>
                <Suspense fallback={<Loading />}>
                  <BudgetManagementPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/invoice",
            element: (
              <RouteGuard requiredPermissions={["oa:invoice:list"]}>
                <Suspense fallback={<Loading />}>
                  <InvoiceManagementPage />
                </Suspense>
              </RouteGuard>
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
              <RouteGuard requiredPermissions={["crm:lead:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmLeadPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/crm/products",
            element: (
              <RouteGuard requiredPermissions={["crm:product:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmProductPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/crm/price-books",
            element: (
              <RouteGuard requiredPermissions={["crm:price-book:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmPriceBookPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/crm/sales-targets",
            element: (
              <RouteGuard requiredPermissions={["crm:sales-target:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmSalesTargetPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/crm/customer-pool",
            element: (
              <RouteGuard requiredPermissions={["crm:customer-pool:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmCustomerPoolPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/crm/assignment-rules",
            element: (
              <RouteGuard requiredPermissions={["crm:assignment-rule:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmAssignmentRulePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/crm/customer/:customerId",
            element: (
              <RouteGuard requiredPermissions={["crm:customer:list"]}>
                <Suspense fallback={<Loading />}>
                  <CrmCustomerWorkspacePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/log",
            element: (
              <RouteGuard requiredPermissions={["system:log:list"]}>
                <Suspense fallback={<Loading />}>
                  <OperationLogPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/audit-log",
            element: (
              <RouteGuard requiredPermissions={["system:audit:list"]}>
                <Suspense fallback={<Loading />}>
                  <AuditLogPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/login-log",
            element: (
              <RouteGuard requiredPermissions={["system:login-log:list"]}>
                <Suspense fallback={<Loading />}>
                  <LoginLogPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/online",
            element: (
              <RouteGuard requiredPermissions={["system:online:list"]}>
                <Suspense fallback={<Loading />}>
                  <OnlineUserPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          // === HR 假勤与 OA 扩展模块路由 ===
          // HR 假勤路由



          // OA 扩展路由
          {
            path: "/office/business-trip",
            element: (
              <RouteGuard requiredPermissions={["oa:trip:list"]}>
                <Suspense fallback={<Loading />}>
                  <BusinessTripPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/contact",
            element: (
              <RouteGuard requiredPermissions={["oa:contact:list"]}>
                <Suspense fallback={<Loading />}>
                  <ContactPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/office/knowledge",
            element: (
              <RouteGuard requiredPermissions={["oa:knowledge:list"]}>
                <Suspense fallback={<Loading />}>
                  <KnowledgePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/visitor",
            element: (
              <RouteGuard requiredPermissions={["oa:visitor:list"]}>
                <Suspense fallback={<Loading />}>
                  <VisitorPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/duty-schedule",
            element: (
              <RouteGuard requiredPermissions={["oa:duty:list"]}>
                <Suspense fallback={<Loading />}>
                  <DutySchedulePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/supplier",
            element: (
              <RouteGuard requiredPermissions={["oa:supplier:list"]}>
                <Suspense fallback={<Loading />}>
                  <SupplierPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/consumable",
            element: (
              <RouteGuard requiredPermissions={["oa:consumable:list"]}>
                <Suspense fallback={<Loading />}>
                  <ConsumablePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/seal",
            element: (
              <RouteGuard requiredPermissions={["oa:seal:list"]}>
                <Suspense fallback={<Loading />}>
                  <SealListPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/license",
            element: (
              <RouteGuard requiredPermissions={["oa:license:list"]}>
                <Suspense fallback={<Loading />}>
                  <LicenseListPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/borrow-management",
            element: (
              <RouteGuard requiredPermissions={["oa:borrow:list"]}>
                <Suspense fallback={<Loading />}>
                  <BorrowManagementPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/admin/risk-alerts",
            element: (
              <RouteGuard requiredPermissions={["oa:risk:list"]}>
                <Suspense fallback={<Loading />}>
                  <RiskAlertPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/dict",
            element: (
              <RouteGuard requiredPermissions={["system:dict:list"]}>
                <Suspense fallback={<Loading />}>
                  <DictPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/category",
            element: (
              <RouteGuard requiredPermissions={["workflow:category:list"]}>
                <Suspense fallback={<Loading />}>
                  <ProcessCategoryPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/management",
            element: (
              <RouteGuard requiredPermissions={["workflow:definition:list"]}>
                <Suspense fallback={<Loading />}>
                  <ProcessManagement />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/import",
            element: (
              <RouteGuard requiredPermissions={["workflow:import:manage"]}>
                <Suspense fallback={<Loading />}>
                  <WorkflowImport />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/archived",
            element: (
              <RouteGuard requiredRoles={[Role.ADMIN]}>
                <Suspense fallback={<Loading />}>
                  <ArchivedWorkflows />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/workflow/versions/:workflowId",
            element: (
              <RouteGuard requiredPermissions={["workflow:definition:view"]}>
                <Suspense fallback={<Loading />}>
                  <VersionHistoryPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/templates/manage",
            element: (
              <RouteGuard requiredPermissions={["workflow:template:add"]}>
                <Suspense fallback={<Loading />}>
                  <TemplateManagement />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/templates",
            element: (
              <RouteGuard requiredPermissions={["workflow:template:list"]}>
                <Suspense fallback={<Loading />}>
                  <TemplateLibrary />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr",
            element: <Navigate to="/hr/dashboard" replace />,
          },
          {
            path: "/hr/dashboard",
            element: (
              <RouteGuard requiredPermissions={["hr:dashboard:view"]}>
                <Suspense fallback={<Loading />}>
                  <HrDashboardPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/employees",
            element: (
              <RouteGuard requiredPermissions={["hr:employees:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrEmployeePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/recruitment",
            element: (
              <RouteGuard requiredPermissions={["hr:recruitment:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrRecruitmentPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/organization",
            element: (
              <RouteGuard requiredPermissions={["hr:organization:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrOrganizationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/lifecycle",
            element: (
              <RouteGuard requiredPermissions={["hr:lifecycle:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrLifecyclePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/attendance",
            element: (
              <RouteGuard requiredPermissions={["hr:attendance:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrAttendancePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/attendance/appeals",
            element: (
              <RouteGuard requiredPermissions={["hr:attendance:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrAttendanceAppealPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/compensation",
            element: (
              <RouteGuard requiredPermissions={["hr:compensation:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrCompensationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/performance",
            element: (
              <RouteGuard requiredPermissions={["hr:performance:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrPerformancePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          // === HR 员工自助（ESS）===
          {
            path: "/hr/ess",
            element: (
              <RouteGuard requiredPermissions={["hr:ess:view"]}>
                <Suspense fallback={<Loading />}>
                  <HrEssPortalPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/ess/slips",
            element: (
              <RouteGuard requiredPermissions={["hr:ess:slip:view"]}>
                <Suspense fallback={<Loading />}>
                  <HrEssSalarySlipPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/ess/certificates",
            element: (
              <RouteGuard requiredPermissions={["hr:ess:cert:apply"]}>
                <Suspense fallback={<Loading />}>
                  <HrEssCertificatePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/ess/profile",
            element: (
              <RouteGuard requiredPermissions={["hr:ess:profile:edit"]}>
                <Suspense fallback={<Loading />}>
                  <HrEssProfilePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/ess/leave",
            element: (
              <RouteGuard requiredPermissions={["hr:ess:leave:view"]}>
                <Suspense fallback={<Loading />}>
                  <HrEssLeaveBalancePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/ess/benefit",
            element: (
              <RouteGuard requiredPermissions={["hr:ess:benefit:view"]}>
                <Suspense fallback={<Loading />}>
                  <HrEssBenefitPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/ess/contract",
            element: (
              <RouteGuard requiredPermissions={["hr:ess:contract:sign"]}>
                <Suspense fallback={<Loading />}>
                  <HrEssContractPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          // === HR 培训管理 ===
          {
            path: "/hr/training",
            element: <Navigate to="/hr/training/plans" replace />,
          },
          {
            path: "/hr/training/plans",
            element: (
              <RouteGuard requiredPermissions={["hr:training:plan:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTrainingPlanPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/training/courses",
            element: (
              <RouteGuard requiredPermissions={["hr:training:course:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTrainingCoursePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/training/sessions",
            element: (
              <RouteGuard requiredPermissions={["hr:training:session:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTrainingSessionPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/training/enrollments",
            element: (
              <RouteGuard requiredPermissions={["hr:training:enroll:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTrainingEnrollmentPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/training/exams",
            element: (
              <RouteGuard requiredPermissions={["hr:training:exam:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTrainingExamPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/training/certificates",
            element: (
              <RouteGuard requiredPermissions={["hr:training:cert:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTrainingCertificatePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/training/archive",
            element: (
              <RouteGuard requiredPermissions={["hr:training:archive:view"]}>
                <Suspense fallback={<Loading />}>
                  <HrTrainingArchivePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          // === HR 人才盘点 ===
          {
            path: "/hr/talent",
            element: (
              <RouteGuard requiredPermissions={["hr:talent:view"]}>
                <Suspense fallback={<Loading />}>
                  <HrTalentDashboardPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/talent/reviews",
            element: (
              <RouteGuard requiredPermissions={["hr:talent:review:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTalentReviewPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/talent/nine-box",
            element: (
              <RouteGuard requiredPermissions={["hr:talent:review:calibrate"]}>
                <Suspense fallback={<Loading />}>
                  <HrTalentNineBoxPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/talent/calibration",
            element: (
              <RouteGuard requiredPermissions={["hr:talent:review:session"]}>
                <Suspense fallback={<Loading />}>
                  <HrTalentCalibrationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/talent/succession",
            element: (
              <RouteGuard requiredPermissions={["hr:talent:succession:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTalentSuccessionPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/talent/pools",
            element: (
              <RouteGuard requiredPermissions={["hr:talent:pool:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTalentPoolPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/talent/development",
            element: (
              <RouteGuard requiredPermissions={["hr:talent:dev:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrTalentDevelopmentPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/talent/archive",
            element: (
              <RouteGuard requiredPermissions={["hr:talent:archive:view", "hr:talent:archive:mine"]}>
                <Suspense fallback={<Loading />}>
                  <HrTalentArchivePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          // === HR 福利与积分商城 (P0 2026-05) ===
          {
            path: "/hr/benefit",
            element: <Navigate to="/hr/benefit/mine" replace />,
          },
          {
            path: "/hr/benefit/mine",
            element: (
              <RouteGuard requiredPermissions={["hr:benefit:mine"]}>
                <Suspense fallback={<Loading />}>
                  <HrBenefitMinePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/benefit/requests",
            element: (
              <RouteGuard requiredPermissions={["hr:benefit:request:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrBenefitRequestPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/benefit/points",
            element: (
              <RouteGuard requiredPermissions={["hr:benefit:point:view"]}>
                <Suspense fallback={<Loading />}>
                  <HrPointAccountPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/benefit/mall",
            element: (
              <RouteGuard requiredPermissions={["hr:benefit:mall:browse"]}>
                <Suspense fallback={<Loading />}>
                  <HrMallPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/benefit/orders",
            element: (
              <RouteGuard requiredPermissions={["hr:benefit:order:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrMallOrderPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/benefit/mall/admin",
            element: (
              <RouteGuard requiredPermissions={["hr:benefit:mall:item-manage"]}>
                <Suspense fallback={<Loading />}>
                  <HrMallItemAdminPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          // === HR 工伤管理 (P0 2026-05) ===
          {
            path: "/hr/work-injury",
            element: <Navigate to="/hr/work-injury/list" replace />,
          },
          {
            path: "/hr/work-injury/list",
            element: (
              <RouteGuard requiredPermissions={["hr:injury:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrWorkInjuryPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/work-injury/investigations",
            element: (
              <RouteGuard requiredPermissions={["hr:injury:investigate"]}>
                <Suspense fallback={<Loading />}>
                  <HrWorkInjuryInvestigationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/work-injury/treatments",
            element: (
              <RouteGuard requiredPermissions={["hr:injury:treatment"]}>
                <Suspense fallback={<Loading />}>
                  <HrWorkInjuryTreatmentPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/work-injury/compensations",
            element: (
              <RouteGuard requiredPermissions={["hr:injury:compensation"]}>
                <Suspense fallback={<Loading />}>
                  <HrWorkInjuryCompensationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/work-injury/rehabilitation",
            element: (
              <RouteGuard requiredPermissions={["hr:injury:rehab"]}>
                <Suspense fallback={<Loading />}>
                  <HrWorkInjuryRehabilitationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          // === HR 劳动争议 (P0 2026-05) ===
          {
            path: "/hr/labor-dispute",
            element: <Navigate to="/hr/labor-dispute/list" replace />,
          },
          {
            path: "/hr/labor-dispute/list",
            element: (
              <RouteGuard requiredPermissions={["hr:dispute:list"]}>
                <Suspense fallback={<Loading />}>
                  <HrLaborDisputePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/labor-dispute/mediations",
            element: (
              <RouteGuard requiredPermissions={["hr:dispute:mediation"]}>
                <Suspense fallback={<Loading />}>
                  <HrDisputeMediationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/hr/labor-dispute/arbitrations",
            element: (
              <RouteGuard requiredPermissions={["hr:dispute:arbitration"]}>
                <Suspense fallback={<Loading />}>
                  <HrDisputeArbitrationPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          // === 新增系统管理路由 ===
          {
            path: "/system/post",
            element: (
              <RouteGuard requiredPermissions={["system:post:list"]}>
                <Suspense fallback={<Loading />}>
                  <PostList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/config",
            element: (
              <RouteGuard requiredPermissions={["system:config:list"]}>
                <Suspense fallback={<Loading />}>
                  <ConfigList />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/rules",
            element: (
              <RouteGuard requiredPermissions={["system:rule:list"]}>
                <Suspense fallback={<Loading />}>
                  <BusinessRulePage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/audit-events",
            element: (
              <RouteGuard requiredPermissions={["system:audit:events"]}>
                <Suspense fallback={<Loading />}>
                  <AuditEventPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/cache",
            element: (
              <RouteGuard requiredPermissions={["system:cache:list"]}>
                <Suspense fallback={<Loading />}>
                  <CacheMonitor />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/api-ratelimit",
            element: (
              <RouteGuard requiredPermissions={["system:apiRateLimit:list"]}>
                <Suspense fallback={<Loading />}>
                  <ApiRateLimitPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/ip-acl",
            element: (
              <RouteGuard requiredPermissions={["system:ipAcl:list"]}>
                <Suspense fallback={<Loading />}>
                  <IpAclPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/system/user-blacklist",
            element: (
              <RouteGuard requiredPermissions={["system:userBlacklist:list"]}>
                <Suspense fallback={<Loading />}>
                  <UserBlacklistPage />
                </Suspense>
              </RouteGuard>
            ),
          },
          {
            path: "/oa/contract-threshold",
            element: (
              <RouteGuard requiredPermissions={["oa:contract:threshold:list"]}>
                <Suspense fallback={<Loading />}>
                  <ContractThresholdPage />
                </Suspense>
              </RouteGuard>
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



