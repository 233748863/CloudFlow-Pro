/**
 * 工作流高级功能权限控制 Hook
 * 提供细粒度的权限检查功能
 */

import { useAuth } from '../context/AuthContext';
import { Role } from '../types';
import {
  WorkflowPermissions,
  canAccessFeature,
  canManageTemplate,
  canViewVersionHistory,
  canRollbackVersion,
  canExportWorkflow,
  canBatchArchive,
  canPermanentDelete,
  canAccessArchiveManagement,
} from '../constants/workflowPermissions';

/**
 * 工作流权限控制 Hook
 */
export function useWorkflowPermission() {
  const { user } = useAuth();
  
  // 如果用户未登录，返回所有权限为 false
  if (!user) {
    return {
      isAdmin: false,
      canManageTemplates: false,
      canViewTemplates: true, // 模板库可以公开查看
      canUseTemplates: false,
      canViewVersionHistory: () => false,
      canRollbackVersion: false,
      canExportOwn: () => false,
      canExportBatch: false,
      canImport: false,
      canImportBatch: false,
      canBatchArchive: false,
      canBatchRestore: false,
      canPermanentDelete: false,
      canAccessArchiveManagement: false,
      hasFeatureAccess: () => false,
    };
  }

  const userRole = user.role;
  const userId = user.id;
  const isAdminUser = userRole === Role.ADMIN;

  return {
    /**
     * 是否是管理员
     */
    isAdmin: isAdminUser,

    /**
     * 是否可以管理模板（创建、编辑、删除）
     */
    canManageTemplates: canManageTemplate(userRole),

    /**
     * 是否可以查看模板库
     */
    canViewTemplates: true, // 所有用户都可以查看模板库

    /**
     * 是否可以从模板创建流程
     */
    canUseTemplates: true, // 所有登录用户都可以使用模板

    /**
     * 是否可以查看版本历史
     * @param workflowCreatorId 流程创建者ID
     */
    canViewVersionHistory: (workflowCreatorId: string) => {
      return canViewVersionHistory(userRole, workflowCreatorId, userId);
    },

    /**
     * 是否可以回滚版本
     */
    canRollbackVersion: canRollbackVersion(userRole),

    /**
     * 是否可以导出自己的流程
     * @param workflowCreatorId 流程创建者ID
     */
    canExportOwn: (workflowCreatorId: string) => {
      return canExportWorkflow(userRole, workflowCreatorId, userId, false);
    },

    /**
     * 是否可以批量导出所有流程
     */
    canExportBatch: isAdminUser,

    /**
     * 是否可以导入流程
     */
    canImport: true, // 所有登录用户都可以导入

    /**
     * 是否可以批量导入
     */
    canImportBatch: isAdminUser,

    /**
     * 是否可以批量归档
     */
    canBatchArchive: canBatchArchive(userRole),

    /**
     * 是否可以批量恢复
     */
    canBatchRestore: isAdminUser,

    /**
     * 是否可以永久删除
     */
    canPermanentDelete: canPermanentDelete(userRole),

    /**
     * 是否可以访问归档管理页面
     */
    canAccessArchiveManagement: canAccessArchiveManagement(userRole),

    /**
     * 检查是否可以访问指定功能
     * @param permission 权限标识
     */
    hasFeatureAccess: (permission: string) => {
      return canAccessFeature(userRole, permission);
    },
  };
}
