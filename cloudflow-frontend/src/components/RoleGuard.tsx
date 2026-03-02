import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface RoleGuardProps {
  allowedRoles: string[];
  fallbackPath?: string;
  children: React.ReactNode;
}

/**
 * 仅用于前端路由体验控制，真实权限仍以后端接口校验为准。
 */
export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  fallbackPath = '/workplace',
  children,
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const currentRole = String((user as any).role || '').toUpperCase();
  const hasAccess = allowedRoles.some((role) => currentRole === String(role).toUpperCase());

  if (!hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
