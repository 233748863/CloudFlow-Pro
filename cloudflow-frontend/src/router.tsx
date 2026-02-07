import React, { Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { isMobileDevice } from './utils/device';
import { MobileLayout } from './mobile/layouts/MobileLayout';
import { MobileDashboard } from './mobile/pages/MobileDashboard';
import { MobileVehicleBooking } from './mobile/pages/vehicle/MobileVehicleBooking';

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
const AnnouncementPage = React.lazy(() => import('./pages/AnnouncementPage').then(module => ({ default: module.AnnouncementPage })));
const SchedulePage = React.lazy(() => import('./pages/SchedulePage').then(module => ({ default: module.SchedulePage })));
const MeetingRoomPage = React.lazy(() => import('./pages/MeetingRoomPage').then(module => ({ default: module.MeetingRoomPage })));
const AttendanceCheckIn = React.lazy(() => import('./pages/admin/attendance/AttendanceCheckIn'));
const AttendanceRulePage = React.lazy(() => import('./pages/admin/attendance/AttendanceRule'));
const AssetList = React.lazy(() => import('./pages/admin/asset/AssetList'));
const VehicleList = React.lazy(() => import('./pages/admin/vehicle/VehicleList'));
const VehicleBooking = React.lazy(() => import('./pages/admin/vehicle/VehicleBooking'));
const VehicleUsageList = React.lazy(() => import('./pages/admin/vehicle/VehicleUsageList'));

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
            path: '/workflow',
            element: <Suspense fallback={<Loading />}><WorkflowDesign /></Suspense>,
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
            element: <MobileDashboard />,
          },
          {
            path: '/dashboard',
            element: <MobileDashboard />,
          },
          {
            path: '/vehicle/booking',
            element: <MobileVehicleBooking />,
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
console.log('Device Detection:', isMobile ? 'Mobile' : 'Desktop');

export const router = createBrowserRouter(isMobile ? mobileRoutes : desktopRoutes);
