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
  assigneeName: t.assigneeName || (t.assignee ? String(t.assignee) : '待认领'), 
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
  id: inst.taskId || inst.instanceId, // 优先使用 taskId（用于审批操作），如果没有则使用 instanceId（用于显示）
  processInstanceId: inst.instanceId,
  workflowId: inst.processDefKey,
  workflowName: inst.title,
  nodeName: inst.status,
  applicantId: String(inst.startUserId),
  applicantName: inst.startUserName,
  // 使用后端返回的 assigneeName（已解析为用户名），回退到"待认领"
  assigneeId: inst.assignee ? String(inst.assignee) : undefined,
  assigneeName: inst.assigneeName || (inst.assignee ? String(inst.assignee) : '待认领'),
  type: 'DYNAMIC',
  // REVOKED 状态映射为 REJECTED（已撤回）
  status: inst.status === 'RUNNING' ? TaskStatus.PENDING 
    : inst.status === 'COMPLETED' ? TaskStatus.APPROVED 
    : inst.status === 'REVOKED' ? TaskStatus.REJECTED
    : TaskStatus.REJECTED,
  createdTime: inst.startTime,
  allowEdit: false,
  formId: inst.formId || '',
  formData: typeof inst.variables === 'string' ? (() => { try { return JSON.parse(inst.variables); } catch { return {}; } })() : (inst.variables || {}),
  reason: ''
});

import { UnifiedTask, WorkTask, WorkTaskStatus } from '../types';

export const mapTaskToUnified = (t: Task): UnifiedTask => {
    // 将流程任务状态映射到工作任务状态，以便在看板视图中正确显示
    let mappedStatus: string;
    let statusLabel: string;
    
    if (t.status === TaskStatus.PENDING) {
        mappedStatus = WorkTaskStatus.TODO;
        statusLabel = '待处理';
    } else if (t.status === TaskStatus.APPROVED) {
        mappedStatus = WorkTaskStatus.DONE;
        statusLabel = '已完成';
    } else if (t.status === TaskStatus.REJECTED) {
        mappedStatus = WorkTaskStatus.DONE;
        statusLabel = '已拒绝';
    } else {
        mappedStatus = WorkTaskStatus.TODO;
        statusLabel = '待处理';
    }
    
    return {
        id: t.id,
        title: `${t.workflowName} - ${t.nodeName}`,
        type: 'PROCESS',
        status: mappedStatus,
        statusLabel,
        priority: 1, // Default Medium
        assigneeId: t.assigneeId,
        assigneeName: t.assigneeName,
        dueDate: t.dueDate,
        createdTime: t.createdTime,
        sourceData: t
    };
};

export const mapWorkTaskToUnified = (t: WorkTask): UnifiedTask => ({
    id: t.taskId,
    title: t.title,
    type: 'WORK',
    status: t.status,
    statusLabel: t.status === WorkTaskStatus.TODO ? '待处理' : (t.status === WorkTaskStatus.DOING ? '进行中' : '已完成'),
    priority: t.priority,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeName || (t.assigneeId ? String(t.assigneeId) : '待认领'), 
    dueDate: t.dueDate,
    createdTime: t.createTime,
    sourceData: t
});
