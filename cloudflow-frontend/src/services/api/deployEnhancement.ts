import request from './request';

// ==================== 类型定义 ====================

export interface DeployWindow {
  id?: number;
  windowName: string;
  windowType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  startTime: string;
  endTime: string;
  weekDays?: string;
  monthDays?: string;
  customDates?: string;
  isEnabled: boolean;
  description?: string;
}

export interface DeployNotification {
  id: number;
  deployId: number;
  notificationType: 'EMAIL' | 'SMS' | 'WEBSOCKET' | 'WECHAT';
  recipientType: 'USER' | 'ROLE' | 'DEPT' | 'ALL';
  recipientIds: string;
  notificationTitle: string;
  notificationContent: string;
  sendStatus: 'PENDING' | 'SENDING' | 'SUCCESS' | 'FAILED';
  sendTime?: string;
  errorMessage?: string;
  createdTime: string;
}

export interface DeployApproval {
  id: number;
  deployId?: number;
  processDefId: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  currentStep: number;
  totalSteps: number;
  approvalConfig?: string;
  submitterId: number;
  submitTime: string;
  completeTime?: string;
}

export interface ApprovalStep {
  id: number;
  approvalId: number;
  stepNo: number;
  stepName: string;
  approverType: 'USER' | 'ROLE' | 'DEPT';
  approverIds: string;
  approvalMode: 'ANY' | 'ALL' | 'SEQUENCE';
  stepStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  actualApproverId?: number;
  approvalComment?: string;
  approvalTime?: string;
}

export interface VersionSnapshot {
  id: number;
  processDefId: string;
  version: number;
  deployId: number;
  snapshotData: string;
  bpmnXml?: string;
  formConfig?: string;
  nodeConfig?: string;
  createdBy: number;
  createdTime: string;
}

export interface RollbackHistory {
  id: number;
  originalDeployId: number;
  rollbackDeployId: number;
  fromVersion: number;
  toVersion: number;
  rollbackReason: string;
  rollbackType: 'MANUAL' | 'AUTO';
  rollbackStatus: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  errorMessage?: string;
  rollbackBy: number;
  rollbackTime: string;
}

export interface ImpactAnalysis {
  processDefId: string;
  impacts: ImpactItem[];
  overallLevel: string;
  allowDeploy: boolean;
}

export interface ImpactItem {
  impactType: string;
  impactLevel: string;
  impactCount: number;
  impactDetail: string;
  suggestion: string;
}

export interface NotificationConfig {
  notificationType: string;
  recipientType: string;
  recipientIds: number[];
  notificationTitle: string;
  notificationContent: string;
}

export interface RollbackRequest {
  deployId: number;
  targetVersion: number;
  rollbackReason: string;
  forceRollback?: boolean;
}

export interface ApprovalStepConfig {
  stepName: string;
  approverType: string;
  approverIds: number[];
  approvalMode: string;
}

export interface DeployApprovalDTO {
  processDefId: string;
  steps: ApprovalStepConfig[];
}

// ==================== 发布窗口管理 ====================

export const checkDeployWindow = () => 
  request.get<{ allowed: boolean; windowName?: string; message: string }>('/workflow/deploy/window/check');

export const listDeployWindows = () => 
  request.get<DeployWindow[]>('/workflow/deploy/window/list');

export const saveDeployWindow = (data: DeployWindow) => 
  request.post('/workflow/deploy/window/save', data);

export const updateDeployWindow = (data: DeployWindow) => 
  request.put('/workflow/deploy/window/update', data);

export const deleteDeployWindow = (windowId: number) => 
  request.delete(`/workflow/deploy/window/delete/${windowId}`);

export const toggleDeployWindow = (windowId: number, enabled: boolean) => 
  request.put(`/workflow/deploy/window/toggle/${windowId}?enabled=${enabled}`);

// ==================== 发布通知 ====================

export const sendDeployNotification = (deployId: number, configs: NotificationConfig[]) => 
  request.post(`/workflow/deploy/notification/send/${deployId}`, configs);

export const listDeployNotifications = (deployId: number) => 
  request.get<DeployNotification[]>(`/workflow/deploy/notification/list/${deployId}`);

export const resendFailedNotifications = (deployId: number) => 
  request.post(`/workflow/deploy/notification/resend/${deployId}`);

// ==================== 回滚机制 ====================

export const rollbackDeploy = (data: RollbackRequest) => 
  request.post('/workflow/deploy/rollback', data);

export const listRollbackVersions = (processDefId: string) => 
  request.get<VersionSnapshot[]>(`/workflow/deploy/rollback/versions/${processDefId}`);

export const listRollbackHistory = (processDefId: string) => 
  request.get<RollbackHistory[]>(`/workflow/deploy/rollback/history/${processDefId}`);

export const getVersionSnapshot = (processDefId: string, version: number) => 
  request.get<VersionSnapshot>(`/workflow/deploy/snapshot/${processDefId}/${version}`);

export const analyzeDeployImpact = (processDefId: string) => 
  request.get<ImpactAnalysis>(`/workflow/deploy/impact/analyze/${processDefId}`);

// ==================== 发布审批流 ====================

export const submitDeployApproval = (definitionId: string, data: DeployApprovalDTO) => 
  request.post(`/workflow/deploy/approval/submit/${definitionId}`, data);

export const approveDeployRequest = (approvalId: number, stepId: number, action: string, comment?: string) => 
  request.post(`/workflow/deploy/approval/approve/${approvalId}/${stepId}?action=${action}${comment ? `&comment=${encodeURIComponent(comment)}` : ''}`);

export const listPendingApprovals = () => 
  request.get<DeployApproval[]>('/workflow/deploy/approval/pending');

export const getApprovalDetail = (approvalId: number) => 
  request.get<{ approval: DeployApproval; steps: ApprovalStep[]; processName?: string; processKey?: string }>(`/workflow/deploy/approval/detail/${approvalId}`);

export const cancelDeployApproval = (approvalId: number) => 
  request.post(`/workflow/deploy/approval/cancel/${approvalId}`);

export const listMySubmittedApprovals = () => 
  request.get<DeployApproval[]>('/workflow/deploy/approval/my-submitted');

export const getDeployStatistics = (processDefId: string) => 
  request.get<{ totalDeploys: number; successCount: number; rollbackCount: number; snapshotCount: number; latestVersion: number }>(`/workflow/deploy/statistics/${processDefId}`);
