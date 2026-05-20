import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface PermissionRouteGuardProps {
  permissions: string[];
  fallbackPath?: string;
  requireAll?: boolean;
  children: React.ReactNode;
}

export const PermissionRouteGuard: React.FC<PermissionRouteGuardProps> = ({
  permissions,
  fallbackPath = '/workplace',
  requireAll = false,
  children,
}) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasPermission(permissions, requireAll)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};

