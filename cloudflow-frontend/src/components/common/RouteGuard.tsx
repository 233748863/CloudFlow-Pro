import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Role } from '../../types';
import { Button } from './button';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: Role[];
  requireAuth?: boolean;
  redirectTo?: string;
}

/**
 * 路由守卫组件
 * 权限源单一化（P0-5）：统一从 AuthContext 取 user.role / user.permissions。
 */
export const RouteGuard: React.FC<RouteGuardProps> = ({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  requireAuth = true,
  redirectTo = '/login',
}) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (requireAuth && !user) {
    return <Navigate to={redirectTo} replace />;
  }

  const isAdmin = user?.role === Role.ADMIN;

  if (requiredPermissions.length > 0 && !isAdmin) {
    const ok = hasPermission(requiredPermissions, true);
    if (!ok) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">权限不足</h2>
          <p className="text-sm text-slate-500">您没有访问此页面的权限</p>
          <Button onClick={() => window.history.back()}>
            返回上一页
          </Button>
        </div>
      );
    }
  }

  if (requiredRoles.length > 0 && !isAdmin) {
    const hasRequiredRole = requiredRoles.some((r) => user?.role === r);
    if (!hasRequiredRole) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">角色不匹配</h2>
          <p className="text-sm text-slate-500">此页面需要特定角色才能访问</p>
          <Button onClick={() => window.history.back()}>
            返回上一页
          </Button>
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
