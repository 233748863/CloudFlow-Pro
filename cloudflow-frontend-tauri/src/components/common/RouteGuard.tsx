import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Role } from '../../types';
import { PageLoading } from './PageLoading';
import { Result403 } from './result';

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
 * 加载态与权限不足态统一走 PageLoading / Result403。
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
    return <PageLoading tip="正在验证身份…" />;
  }

  if (requireAuth && !user) {
    return <Navigate to={redirectTo} replace />;
  }

  const isAdmin = user?.role === Role.ADMIN;

  if (requiredPermissions.length > 0 && !isAdmin) {
    const ok = hasPermission(requiredPermissions, true);
    if (!ok) {
      return (
        <Result403
          title="权限不足"
          subTitle="您没有访问此页面的权限"
        />
      );
    }
  }

  if (requiredRoles.length > 0 && !isAdmin) {
    const hasRequiredRole = requiredRoles.some((r) => user?.role === r);
    if (!hasRequiredRole) {
      return (
        <Result403
          title="角色不匹配"
          subTitle="此页面需要特定角色才能访问"
        />
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
