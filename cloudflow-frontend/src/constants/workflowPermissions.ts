/**
 * 工作流高级功能权限常量
 * 定义各个功能模块所需的权限和角色
 */

import { Role } from '../types';

/**
 * 工作流高级功能权限定义
 */
export const WorkflowPermissions = {
  // 模板管理权限（仅管理员）
  TEMPLATE_MANAGE: 'workflow:template:manage',      // 管理模板（创建、编辑、删除）
  TEMPLATE_VIEW: 'workflow:template:view',          // 查看模板库
  TEMPLATE_USE: 'workflow:template:use',            // 从模板创建流程
  
  // 版本控制权限
  VERSION_VIEW: 'workflow:version:view',            // 查看版本历史
  VERSION_ROLLBACK: 'workflow:version:rollback',    // 版本回滚（仅管理员）
  
  // 导入导出权限
  EXPORT_OWN: 'workflow:export:own',                // 导出自己的流程
  EXPORT_ALL: 'workflow:export:all',                // 批量导出所有流程（仅管理员）
  IMPORT: 'workflow:import',                        // 导入流程
  IMPORT_BATCH: 'workflow:import:batch',            // 批量导入（仅管理员）
  
  // 批量操作权限（仅管理员）
  BATCH_ARCHIVE: 'workflow:batch:archive',          // 批量归档
  BATCH_RESTORE: 'workflow:batch:restore',          // 批量恢复
  BATCH_DELETE: 'workflow:batch:delete',            // 永久删除
  ARCHIVE_MANAGE: 'workflow:archive:manage',        // 归档管理
} as const;

/**
 * 管理员专属功能列表
 * 这些功能只有管理员角色才能访问
 */
export const ADMIN_ONLY_FEATURES = [
  WorkflowPermissions.TEMPLATE_MANAGE,
  WorkflowPermissions.VERSION_ROLLBACK,
  WorkflowPermissions.EXPORT_ALL,
  WorkflowPermissions.IMPORT_BATCH,
  WorkflowPermissions.BATCH_ARCHIVE,
  WorkflowPermissions.BATCH_RESTORE,
  WorkflowPermissions.BATCH_DELETE,
  WorkflowPermissions.ARCHIVE_MANAGE,
] as const;

/**
 * 普通用户可用功能列表
 */
export const USER_FEATURES = [
  WorkflowPermissions.TEMPLATE_VIEW,
  WorkflowPermissions.TEMPLATE_USE,
  WorkflowPermissions.VERSION_VIEW,
  WorkflowPermissions.EXPORT_OWN,
  WorkflowPermissions.IMPORT,
] as const;

/**
 * 检查用户是否可以访问指定功能
 * @param userRole 用户角色
 * @param permission 权限标识
 * @returns 是否有权限
 */
export function canAccessFeature(userRole: Role, permission: string): boolean {
  // 管理员拥有所有权限
  if (userRole === Role.ADMIN) {
    return true;
  }
  
  // 检查是否是管理员专属功能
  if (ADMIN_ONLY_FEATURES.includes(permission as any)) {
    return false;
  }
  
  // 检查是否是普通用户可用功能
  return USER_FEATURES.includes(permission as any);
}

/**
 * 检查用户是否可以管理模板
 */
export function canManageTemplate(userRole: Role): boolean {
  return userRole === Role.ADMIN;
}

/**
 * 检查用户是否可以查看版本历史
 * @param userRole 用户角色
 * @param workflowCreatorId 流程创建者ID
 * @param currentUserId 当前用户ID
 */
export function canViewVersionHistory(
  userRole: Role, 
  workflowCreatorId: string, 
  currentUserId: string
): boolean {
  // 管理员可以查看所有流程的版本历史
  if (userRole === Role.ADMIN) {
    return true;
  }
  
  // 流程创建者可以查看自己流程的版本历史
  return workflowCreatorId === currentUserId;
}

/**
 * 检查用户是否可以回滚版本
 */
export function canRollbackVersion(userRole: Role): boolean {
  return userRole === Role.ADMIN;
}

/**
 * 检查用户是否可以导出流程
 * @param userRole 用户角色
 * @param workflowCreatorId 流程创建者ID
 * @param currentUserId 当前用户ID
 * @param isBatch 是否批量导出
 */
export function canExportWorkflow(
  userRole: Role,
  workflowCreatorId: string,
  currentUserId: string,
  isBatch: boolean = false
): boolean {
  // 管理员可以导出所有流程
  if (userRole === Role.ADMIN) {
    return true;
  }
  
  // 批量导出仅管理员可用
  if (isBatch) {
    return false;
  }
  
  // 普通用户只能导出自己创建的流程
  return workflowCreatorId === currentUserId;
}

/**
 * 检查用户是否可以批量归档
 */
export function canBatchArchive(userRole: Role): boolean {
  return userRole === Role.ADMIN;
}

/**
 * 检查用户是否可以永久删除
 */
export function canPermanentDelete(userRole: Role): boolean {
  return userRole === Role.ADMIN;
}

/**
 * 检查用户是否可以访问归档管理页面
 */
export function canAccessArchiveManagement(userRole: Role): boolean {
  return userRole === Role.ADMIN;
}
