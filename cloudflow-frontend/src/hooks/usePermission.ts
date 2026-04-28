import { useAuth } from '../context/AuthContext';
import { Role } from '../types';

export function usePermission() {
  const { user: currentUser } = useAuth();
  const permissions = currentUser?.permissions || [];

  const hasPermission = (permission: string): boolean => permissions.includes(permission);

  const hasRole = (role: Role): boolean => currentUser?.role === role;

  const hasAnyPermission = (perms: string[]): boolean => perms.some((permission) => hasPermission(permission));

  const hasAllPermissions = (perms: string[]): boolean => perms.every((permission) => hasPermission(permission));

  const hasAnyRole = (roles: Role[]): boolean => roles.some((role) => hasRole(role));

  const isAdmin = (): boolean => hasRole(Role.ADMIN);

  const isTaskAssignee = (assigneeId?: string): boolean => Boolean(assigneeId && currentUser?.id === assigneeId);

  return {
    currentUser,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    isAdmin,
    isTaskAssignee,
  };
}
