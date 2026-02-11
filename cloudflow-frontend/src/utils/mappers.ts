import { User, Role, Task, TaskStatus } from '../types';

export const mapBackendUserToFrontend = (u: any): User => ({
  id: String(u.userId),
  name: u.nickName || u.userName,
  email: u.email || '',
  role: (u.role as Role) || Role.EMPLOYEE,
  status: u.status === '0' ? 'ACTIVE' : 'INACTIVE',
  avatar: u.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u.userName
});

export const mapBackendTaskToFrontend = (t: any): Task => ({
  id: t.taskId,
  processInstanceId: t.instanceId,
  workflowId: t.processDefKey,
  workflowName: t.processName || t.processDefKey,
  nodeName: t.nodeName,
  applicantId: t.startUserId,
  applicantName: t.startUserName || 'Unknown',
  assigneeId: String(t.assignee),
  assigneeName: String(t.assignee), 
  type: 'DYNAMIC',
  status: t.status === 'TODO' ? TaskStatus.PENDING : TaskStatus.APPROVED,
  createdTime: t.createTime,
  dueDate: t.dueTime,
  allowEdit: false,
  formId: t.formId || '', 
  formData: t.variables || {},
  reason: t.variables?.reason || ''
});

export const mapBackendInstanceToTask = (inst: any): Task => ({
  id: inst.taskId || inst.instanceId, // 优先使用 taskId，如果没有则使用 instanceId（用于显示）
  processInstanceId: inst.instanceId,
  workflowId: inst.processDefKey,
  workflowName: inst.title,
  nodeName: inst.status,
  applicantId: String(inst.startUserId),
  applicantName: inst.startUserName,
  assigneeId: inst.assignee ? String(inst.assignee) : undefined,
  assigneeName: inst.assigneeName || (inst.assignee ? String(inst.assignee) : undefined),
  type: 'DYNAMIC',
  status: inst.status === 'RUNNING' ? TaskStatus.PENDING : (inst.status === 'COMPLETED' ? TaskStatus.APPROVED : TaskStatus.REJECTED),
  createdTime: inst.startTime,
  allowEdit: false,
  formId: inst.formId || '',
  formData: typeof inst.variables === 'string' ? JSON.parse(inst.variables) : (inst.variables || {}),
  reason: ''
});

import { UnifiedTask, WorkTask, WorkTaskStatus } from '../types';

export const mapTaskToUnified = (t: Task): UnifiedTask => ({
    id: t.id,
    title: `${t.workflowName} - ${t.nodeName}`,
    type: 'PROCESS',
    status: t.status,
    statusLabel: t.status === 'PENDING' ? '待处理' : '已完成', 
    priority: 1, // Default Medium
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeName,
    dueDate: t.dueDate,
    createdTime: t.createdTime,
    sourceData: t
});

export const mapWorkTaskToUnified = (t: WorkTask): UnifiedTask => ({
    id: t.taskId,
    title: t.title,
    type: 'WORK',
    status: t.status,
    statusLabel: t.status === WorkTaskStatus.TODO ? '待处理' : (t.status === WorkTaskStatus.DOING ? '进行中' : '已完成'),
    priority: t.priority,
    assigneeId: t.assigneeId,
    assigneeName: String(t.assigneeId), 
    dueDate: t.dueDate,
    createdTime: t.createTime,
    sourceData: t
});
