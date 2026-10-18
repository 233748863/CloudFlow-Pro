import type { NodeOperationPermissions, RejectStrategy } from '@/types/workflowSemantic';
import { Role, TaskStatus, type Task, type User } from '@/types';

export const getTaskAgentMode = (task: Task | null | undefined, userId: string | undefined): Task['agentMode'] =>
  userId && task?.assigneeId !== userId && task?.proxyUserId === userId && task.agentSettingId
    && (task.status === TaskStatus.PENDING || task.status === TaskStatus.DELEGATED)
    ? task.agentMode : undefined;

export const isTaskInCurrentTodo = (task: Task, currentUser: User): boolean =>
  task.status === TaskStatus.PENDING && (task.assigneeId === currentUser.id
    || Boolean(getTaskAgentMode(task, currentUser.id))
    || !task.assigneeId && task.assigneeRole === currentUser.role);

export const canHandleWorkflowTask = (task: Task | null | undefined, currentUser: User | null | undefined): boolean => {
  if (!task || !currentUser || ![TaskStatus.PENDING, TaskStatus.DELEGATED].includes(task.status)) return false;
  if (task.assigneeId !== currentUser.id && task.proxyUserId === currentUser.id) return getTaskAgentMode(task, currentUser.id) === 'AGENT';
  return task.assigneeId === currentUser.id || Boolean(task.assigneeRole && task.assigneeRole === currentUser.role) || currentUser.role === Role.ADMIN;
};

export const allowsNodeOperation = (permissions: NodeOperationPermissions | undefined, operation: keyof NodeOperationPermissions): boolean =>
  permissions?.[operation] !== false;

export const allowsRejection = (permissions: NodeOperationPermissions | undefined, strategy?: RejectStrategy): boolean =>
  !strategy || strategy === 'TERMINATE' || allowsNodeOperation(permissions, 'allowRollback');

export const canWithdrawWorkflowApproval = (task: Task, userId: string | undefined): boolean =>
  task.canWithdraw === true && Boolean(task.historyId) && Boolean(userId) && task.operatorId === userId;
