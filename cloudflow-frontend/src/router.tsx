import React, { Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { isMobileDevice } from '@/utils/device';
import { logger } from '@/utils/logger';
import { MobileLayout } from '@/mobile/layouts/MobileLayout';

// Lazy load Mobile pages for better performance
const MobileDashboard = React.lazy(() => import('@/mobile/pages/MobileDashboard').then(module => ({ default: module.MobileDashboard })));
const MobileVehicleBooking = React.lazy(() => import('@/mobile/pages/vehicle/MobileVehicleBooking').then(module => ({ default: module.MobileVehicleBooking })));
const MobileProfile = React.lazy(() => import('@/mobile/pages/MobileProfile').then(module => ({ default: module.MobileProfile })));
const MobileMessages = React.lazy(() => import('@/mobile/pages/MobileMessages').then(module => ({ default: module.MobileMessages })));
const MobileTasks = React.lazy(() => import('@/mobile/pages/MobileTasks').then(module => ({ default: module.MobileTasks })));
const MobileSchedule = React.lazy(() => import('@/mobile/pages/MobileSchedule').then(module => ({ default: module.MobileSchedule })));
const MobileMeetingRoom = React.lazy(() => import('@/mobile/pages/MobileMeetingRoom').then(module => ({ default: module.MobileMeetingRoom })));
const MobileLeaveRequest = React.lazy(() => import('@/mobile/pages/MobileLeaveRequest').then(module => ({ default: module.MobileLeaveRequest })));
const MobileReimbursement = React.lazy(() => import('@/mobile/pages/MobileReimbursement').then(module => ({ default: module.MobileReimbursement })));
const MobileWorkflowMonitor = React.lazy(() => import('@/mobile/pages/MobileWorkflowMonitor').then(module => ({ default: module.MobileWorkflowMonitor })));

// Lazy load Desktop pages
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Workplace = React.lazy(() => import('./pages/Workplace').then(module => ({ default: module.Workplace })));
const TaskListPage = React.lazy(() => import('./pages/TaskListPage').then(module => ({ default: module.TaskListPage })));
const WorkflowDesign = React.lazy(() => import('./pages/WorkflowDesign').then(module => ({ default: module.WorkflowDesign })));
const FormDesign = React.lazy(() => import('./pages/FormDesign').then(module => ({ default: module.FormDesign })));
const OrgStructurePage = React.lazy(() => import('./pages/OrgStructurePage').then(module => ({ default: module.OrgStructurePage })));
const CodeGeneration = React.lazy(() => import('./pages/CodeGeneration').then(module => ({ default: module.CodeGeneration })));
const UserList = React.lazy(() => import('./pages/system/UserList').then(module => ({ default: module.UserList })));
const RoleList = React.lazy(() => import('./pages/system/RoleList').then(module => ({ default: module.RoleList })));
const MenuList = React.lazy(() => import('./pages/system/MenuList').then(module => ({ default: module.MenuList })));
const FileList = React.lazy(() => import('./pages/system/FileList').then(module => ({ default: module.FileList })));
const TenantList = React.lazy(() => import('./pages/system/TenantList').then(module => ({ default: module.TenantList })));
const AnnouncementPage = React.lazy(() => import('./pages/AnnouncementPage').then(module => ({ default: module.AnnouncementPage })));
const SchedulePage = React.lazy(() => import('./pages/SchedulePage').then(module => ({ default: module.SchedulePage })));
const MeetingRoomPage = React.lazy(() => import('./pages/MeetingRoomPage').then(module => ({ default: module.MeetingRoomPage })));
const AttendanceCheckIn = React.lazy(() => import('./pages/admin/attendance/AttendanceCheckIn'));
const AttendanceRulePage = React.lazy(() => import('./pages/admin/attendance/AttendanceRule'));
const AssetList = React.lazy(() => import('./pages/admin/asset/AssetList'));
const VehicleList = React.lazy(() => import('./pages/admin/vehicle/VehicleList'));
const VehicleBooking = React.lazy(() => import('@/pages/admin/vehicle/VehicleBooking').then(m => ({ default: m.VehicleBooking })));
const VehicleUsageList = React.lazy(() => import('./pages/admin/vehicle/VehicleUsageList'));
const WorkflowMonitor = React.lazy(() => import('./pages/WorkflowMonitor').then(module => ({ default: module.default })));
const DeployManagement = React.lazy(() => import('./pages/DeployManagement').then(module => ({ default: module.DeployManagement })));
const ExpenseClaimPage = React.lazy(() => import('./pages/ExpenseClaimPage'));
const PaymentRequestPage = React.lazy(() => import('./pages/PaymentRequestPage').then(module => ({ default: module.PaymentRequestPage })));
const CopyListPage = React.lazy(() => import('./pages/CopyListPage').then(module => ({ default: module.CopyListPage })));
const OperationLogPage = React.lazy(() => import('./pages/system/OperationLogPage').then(module => ({ default: module.OperationLogPage })));
const AuditLogPage = React.lazy(() => import('./pages/system/AuditLogPage').then(module => ({ default: module.AuditLogPage })));

// OA扩展模块页面 - 补卡申请、加班申请、出差申请、通讯录、访客管理、值班排班
const AttendanceAppealPage = React.lazy(() => import('./pages/AttendanceAppealPage'));
const OvertimePage = React.lazy(() => import('./pages/OvertimePage'));
const BusinessTripPage = React.lazy(() => import('./pages/BusinessTripPage'));
const ContactPage = React.lazy(() => import('./pages/ContactPage'));
const VisitorPage = React.lazy(() => import('./pages/VisitorPage'));
const DutySchedulePage = React.lazy(() => import('./pages/DutySchedulePage'));


const Loading = () => (
  <div className="flex items-center justify-center h-full w-full min-h-[400px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
  </div>
);

// --- Desktop Routes (Unchanged) ---
const desktopRoutes = [
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: '/',
            element: <Suspense fallback={<Loading />}><Dashboard /></Suspense>,
          },
          {
            path: '/dashboard', // Alias
            element: <Suspense fallback={<Loading />}><Dashboard /></Suspense>,
          },
          {
            path: '/workplace',
            element: <Suspense fallback={<Loading />}><Workplace /></Suspense>,
          },
          {
            path: '/tasks',
            element: <Suspense fallback={<Loading />}><TaskListPage type="pending" /></Suspense>,
          },
          {
            path: '/announcement',
            element: <Suspense fallback={<Loading />}><AnnouncementPage /></Suspense>,
          },
          {
            path: '/office/announcement',
            element: <Suspense fallback={<Loading />}><AnnouncementPage /></Suspense>,
          },
          {
            path: '/schedule',
            element: <Suspense fallback={<Loading />}><SchedulePage /></Suspense>,
          },
          {
            path: '/meeting-room',
            element: <Suspense fallback={<Loading />}><MeetingRoomPage /></Suspense>,
          },
          {
            path: '/my-apps',
            element: <Suspense fallback={<Loading />}><TaskListPage type="applications" /></Suspense>,
          },
          {
            path: '/my-copies',
            element: <Suspense fallback={<Loading />}><CopyListPage /></Suspense>,
          },
          {
            path: '/workflow',
            element: <Suspense fallback={<Loading />}><WorkflowDesign /></Suspense>,
          },
          {
            path: '/workflow/monitor',
            element: <Suspense fallback={<Loading />}><WorkflowMonitor /></Suspense>,
          },
          {
            path: '/workflow/deploy',
            element: <Suspense fallback={<Loading />}><DeployManagement /></Suspense>,
          },
          {
            path: '/forms',
            element: <Suspense fallback={<Loading />}><FormDesign /></Suspense>,
          },
          {
            path: '/users',
            element: <Suspense fallback={<Loading />}><OrgStructurePage /></Suspense>,
          },
          {
            path: '/code',
            element: <Suspense fallback={<Loading />}><CodeGeneration /></Suspense>,
          },
          {
            path: '/system/users',
            element: <Suspense fallback={<Loading />}><UserList /></Suspense>,
          },
          {
            path: '/system/roles',
            element: <Suspense fallback={<Loading />}><RoleList /></Suspense>,
          },
          {
            path: '/system/menus',
            element: <Suspense fallback={<Loading />}><MenuList /></Suspense>,
          },
          {
            path: '/system/files',
            element: <Suspense fallback={<Loading />}><FileList /></Suspense>,
          },
          {
            path: '/system/tenant',
            element: <Suspense fallback={<Loading />}><TenantList /></Suspense>,
          },
          {
            path: '/admin/attendance/checkin',
            element: <Suspense fallback={<Loading />}><AttendanceCheckIn /></Suspense>,
          },
          {
            path: '/admin/attendance/rule',
            element: <Suspense fallback={<Loading />}><AttendanceRulePage /></Suspense>,
          },
          {
            path: '/admin/asset',
            element: <Suspense fallback={<Loading />}><AssetList /></Suspense>,
          },
          {
            path: '/admin/vehicle',
            element: <Navigate to="/admin/vehicle/list" replace />,
          },
          {
            path: '/admin/vehicle/list',
            element: <Suspense fallback={<Loading />}><VehicleList /></Suspense>,
          },
          {
            path: '/admin/vehicle/booking',
            element: <Suspense fallback={<Loading />}><VehicleBooking /></Suspense>,
          },
          {
            path: '/admin/vehicle/usage',
            element: <Suspense fallback={<Loading />}><VehicleUsageList /></Suspense>,
          },
          {
            path: '/expense/claim',
            element: <Suspense fallback={<Loading />}><ExpenseClaimPage /></Suspense>,
          },
          {
            path: '/payment/request',
            element: <Suspense fallback={<Loading />}><PaymentRequestPage /></Suspense>,
          },
          {
            path: '/system/log',
            element: <Suspense fallback={<Loading />}><OperationLogPage /></Suspense>,
          },
          {
            path: '/system/audit-log',
            element: <Suspense fallback={<Loading />}><AuditLogPage /></Suspense>,
          },
          // === OA扩展模块路由 ===
          {
            path: '/office/attendance-appeal',
            element: <Suspense fallback={<Loading />}><AttendanceAppealPage /></Suspense>,
          },
          {
            path: '/office/overtime',
            element: <Suspense fallback={<Loading />}><OvertimePage /></Suspense>,
          },
          {
            path: '/office/business-trip',
            element: <Suspense fallback={<Loading />}><BusinessTripPage /></Suspense>,
          },
          {
            path: '/office/contact',
            element: <Suspense fallback={<Loading />}><ContactPage /></Suspense>,
          },
          {
            path: '/admin/visitor',
            element: <Suspense fallback={<Loading />}><VisitorPage /></Suspense>,
          },
          {
            path: '/admin/duty-schedule',
            element: <Suspense fallback={<Loading />}><DutySchedulePage /></Suspense>,
          },
        ],
      },
    ],
  },
];

// --- Mobile Routes (New) ---
const mobileRoutes = [
  {
    path: '/login',
    element: <Login />, // Can be replaced with MobileLogin if needed
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MobileLayout />,
        children: [
          {
            path: '/',
            element: <Suspense fallback={<Loading />}><MobileDashboard /></Suspense>,
          },
          {
            path: '/dashboard',
            element: <Suspense fallback={<Loading />}><MobileDashboard /></Suspense>,
          },
          {
            path: '/vehicle/booking',
            element: <Suspense fallback={<Loading />}><MobileVehicleBooking /></Suspense>,
          },
          {
            path: '/profile',
            element: <Suspense fallback={<Loading />}><MobileProfile /></Suspense>,
          },
          {
            path: '/messages',
            element: <Suspense fallback={<Loading />}><MobileMessages /></Suspense>,
          },
          {
            path: '/tasks',
            element: <Suspense fallback={<Loading />}><MobileTasks /></Suspense>,
          },
          {
            path: '/schedule',
            element: <Suspense fallback={<Loading />}><MobileSchedule /></Suspense>,
          },
          {
            path: '/meeting-room',
            element: <Suspense fallback={<Loading />}><MobileMeetingRoom /></Suspense>,
          },
          {
            path: '/leave/request',
            element: <Suspense fallback={<Loading />}><MobileLeaveRequest /></Suspense>,
          },
          {
            path: '/reimbursement/request',
            element: <Suspense fallback={<Loading />}><MobileReimbursement /></Suspense>,
          },
          {
            path: '/workflow/monitor',
            element: <Suspense fallback={<Loading />}><MobileWorkflowMonitor /></Suspense>,
          },
          // Fallback for not-yet-implemented mobile pages
          {
            path: '*',
            element: <div className="p-4 text-center text-gray-500 mt-20">此功能暂不支持移动端，请在电脑访问。</div>
          }
        ],
      },
    ],
  },
];

// --- Router Factory ---
// Determine which router to use based on device type
const isMobile = isMobileDevice();
logger.log('Device Detection:', isMobile ? 'Mobile' : 'Desktop');

export const router = createBrowserRouter(isMobile ? mobileRoutes : desktopRoutes);
