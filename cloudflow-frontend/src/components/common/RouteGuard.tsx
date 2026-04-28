import React from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { Role } from '../../types';
import { Button } from './button';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: Role[];
  requireAuth?: boolean;
  redirectTo?: string;
}

const AccessDenied = ({ title }: { title: string }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
      <ShieldAlert className="text-red-500" size={32} />
    </div>
    <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
    <p className="text-sm text-slate-500">当前账号没有访问此页面的权限</p>
    <Button onClick={() => window.history.back()}>返回上一页</Button>
  </div>
);

export const RouteGuard: React.FC<RouteGuardProps> = ({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  requireAuth = true,
  redirectTo = '/login',
}) => {
  const { user, loading } = useAuth();
  const { hasPermission, hasRole } = usePermission();

  if (loading) return null;

  if (requireAuth && !user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (user?.role === Role.ADMIN) {
    return <>{children}</>;
  }

  if (requiredPermissions.length > 0 && !requiredPermissions.every((permission) => hasPermission(permission))) {
    return <AccessDenied title="权限不足" />;
  }

  if (requiredRoles.length > 0 && !requiredRoles.some((role) => hasRole(role))) {
    return <AccessDenied title="角色不匹配" />;
  }

  return <>{children}</>;
};

export const AdminRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RouteGuard requiredRoles={[Role.ADMIN]}>{children}</RouteGuard>
);

export const HrRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RouteGuard requiredRoles={[Role.ADMIN, Role.HR]}>{children}</RouteGuard>
);
