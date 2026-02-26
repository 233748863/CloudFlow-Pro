import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '../../stores/workflowStore';
import { Role } from '../../types';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: Role[];
  requireAuth?: boolean;
  redirectTo?: string;
}

/**
 * 路由守卫组件
 * 控制页面级别的访问权限
 */
export const RouteGuard: React.FC<RouteGuardProps> = ({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  requireAuth = true,
  redirectTo = '/login',
}) => {
  const { isAuthenticated, currentUser, permissions, hasPermission, hasRole } = useAppStore();

  // 检查认证状态
  if (requireAuth && !isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  // 检查权限
  if (requiredPermissions.length > 0) {
    const hasAllPermissions = requiredPermissions.every((p) => hasPermission(p));
    if (!hasAllPermissions) {
      // 管理员跳过权限检查
      if (currentUser?.role !== Role.ADMIN) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-800">权限不足</h2>
            <p className="text-sm text-slate-500">您没有访问此页面的权限</p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600"
            >
              返回上一页
            </button>
          </div>
        );
      }
    }
  }

  // 检查角色
  if (requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.some((r) => hasRole(r));
    if (!hasRequiredRole && currentUser?.role !== Role.ADMIN) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">角色不匹配</h2>
          <p className="text-sm text-slate-500">此页面需要特定角色才能访问</p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600"
          >
            返回上一页
          </button>
        </div>
      );
    }
  }

  return <>{children}</>;
};

/**
 * 管理员路由守卫
 */
export const AdminRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RouteGuard requiredRoles={[Role.ADMIN]}>{children}</RouteGuard>
);

/**
 * 管理层路由守卫（管理员 + 经理）
 */
export const ManagerRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RouteGuard requiredRoles={[Role.ADMIN, Role.MANAGER]}>{children}</RouteGuard>
);
