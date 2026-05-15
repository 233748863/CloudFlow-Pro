import { useAuth } from '@/context/AuthContext';
import { Role } from '../types';
import { WorkflowPermissions } from '../constants/workflowPermissions';

export function useWorkflowPermission() {
  const { user } = useAuth();

  if (!user) {
    return {
      isAdmin: false,
      canManageTemplates: false,
      canViewTemplates: false,
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

  const userId = user.id;
  const isAdminUser = user.role === Role.ADMIN;
  const permissions = user.permissions || [];
  const hasPermission = (permission: string) =>
    permissions.includes(permission)
    || permissions.includes('*:*:*')
    || permissions.includes('*');
  const canViewWorkflowHistory = (workflowCreatorId: string) =>
    isAdminUser || workflowCreatorId === userId;

  return {
    isAdmin: isAdminUser,
    canManageTemplates: hasPermission(WorkflowPermissions.TEMPLATE_MANAGE),
    canViewTemplates: hasPermission(WorkflowPermissions.TEMPLATE_VIEW),
    canUseTemplates: hasPermission(WorkflowPermissions.TEMPLATE_USE),
    canViewVersionHistory: (workflowCreatorId: string) => canViewWorkflowHistory(workflowCreatorId),
    canRollbackVersion: hasPermission(WorkflowPermissions.VERSION_ROLLBACK) && isAdminUser,
    canExportOwn: (workflowCreatorId: string) => hasPermission(WorkflowPermissions.EXPORT_OWN) && canViewWorkflowHistory(workflowCreatorId),
    canExportBatch: isAdminUser,
    canImport: hasPermission(WorkflowPermissions.IMPORT),
    canImportBatch: hasPermission(WorkflowPermissions.IMPORT_BATCH) && isAdminUser,
    canBatchArchive: isAdminUser,
    canBatchRestore: isAdminUser,
    canPermanentDelete: isAdminUser,
    canAccessArchiveManagement: isAdminUser,
    hasFeatureAccess: (permission: string) => hasPermission(permission),
    canManageProcesses: hasPermission(WorkflowPermissions.PROCESS_MANAGE),
  };
}
