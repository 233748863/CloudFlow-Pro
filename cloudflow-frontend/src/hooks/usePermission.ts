import { useAppStore } from '../stores/workflowStore';
import { Role } from '../types';

/**
 * 权限控制 Hook
 * 用于检查用户权限和角色
 */
export function usePermission() {
  const currentUser = useAppStore((s) => s.currentUser);
  const permissions = useAppStore((s) => s.permissions);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const hasRole = useAppStore((s) => s.hasRole);

  /**
   * 检查是否有任一权限
   */
  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some((p) => hasPermission(p));
  };

  /**
   * 检查是否有所有权限
   */
  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every((p) => hasPermission(p));
  };

  /**
   * 检查是否有任一角色
   */
  const hasAnyRole = (roles: Role[]): boolean => {
    return roles.some((r) => hasRole(r));
  };

  /**
   * 检查是否是管理员
   */
  const isAdmin = (): boolean => {
    return hasRole(Role.ADMIN);
  };

  /**
   * 检查是否是流程发起人
   */
  const isProcessInitiator = (applicantId: string): boolean => {
    return currentUser?.id === applicantId;
  };

  /**
   * 检查是否是任务处理人
   */
  const isTaskAssignee = (assigneeId?: string): boolean => {
    if (!assigneeId) return false;
    return currentUser?.id === assigneeId;
  };

  return {
    currentUser,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    isAdmin,
    isProcessInitiator,
    isTaskAssignee,
  };
}
