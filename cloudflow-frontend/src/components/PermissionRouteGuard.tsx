import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface PermissionRouteGuardProps {
  permissions: string[];
  fallbackPath?: string;
  requireAll?: boolean;
  children: React.ReactNode;
}

const hasPermission = (userPermissions: string[] = [], permission: string) =>
  userPermissions.includes(permission)
  || userPermissions.includes('*:*:*')
  || userPermissions.includes('*');

export const PermissionRouteGuard: React.FC<PermissionRouteGuardProps> = ({
  permissions,
  fallbackPath = '/workplace',
  requireAll = false,
  children,
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const userPermissions = user.permissions || [];
  const hasAccess = requireAll
    ? permissions.every((permission) => hasPermission(userPermissions, permission))
    : permissions.some((permission) => hasPermission(userPermissions, permission));

  if (!hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
