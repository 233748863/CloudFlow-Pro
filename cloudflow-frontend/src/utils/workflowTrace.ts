import type { ProcessTrace } from '@/types/workflow';

export interface WorkflowTraceNode {
  id: string;
  nodeKey: string;
  name: string;
  type: 'HISTORY' | 'ACTIVE';
  taskType?: string;
  nodeType?: string;
  action?: string;
  status: 'finished' | 'active' | 'pending' | 'rejected' | 'skipped';
  operator?: string;
  operatorName?: string;
  onBehalfOfUserId?: string;
  onBehalfOfUserName?: string;
  comment?: string;
  time?: string;
}

const actionLabels: Record<string, string> = {
  APPROVE: '同意', REJECT: '拒绝', COUNTERSIGN_APPROVE: '投票同意', COUNTERSIGN_REJECT: '投票反对',
  RETURN: '回退', REJECT_TO_PREVIOUS: '退回上一步', TRANSFER: '转办', DELEGATE: '交由他人处理',
  DELEGATE_RETURN: '归还原审批人', ADD_SIGN: '加签', REDUCE_SIGN: '减签',
  AGENT_RETURN: '归还原审批人', AGENT_ASSIST: '提交协办意见',
  WITHDRAW: '撤回本人审批', REJECT_TO_INITIATOR: '退回发起人', REJECT_TO_NODE: '退回指定节点', REJECT_TO_PARENT: '退回父流程',
  AUTO_PASS: '自动通过', AUTO_REJECT: '自动驳回', AUTO_SKIP: '自动跳过',
  START: '发起', SUBMIT: '提交', COMPLETE: '完成', CC: '抄送', COPY: '抄送',
};

export const getWorkflowActionLabel = (action?: string): string =>
  actionLabels[action ?? ''] ?? action ?? '';

export const getWorkflowOperatorLabel = (detail: { operatorName?: string; onBehalfOfUserId?: string | number; onBehalfOfUserName?: string }): string => {
  const operator = detail.operatorName || '系统';
  return detail.onBehalfOfUserId != null ? `${operator}（代${detail.onBehalfOfUserName || detail.onBehalfOfUserId}办理）` : operator;
};

export const getWorkflowActionState = (action?: string, taskType?: string): WorkflowTraceNode['status'] => {
  const value = String(action ?? '').toUpperCase();
  if (taskType === 'AUTO_SKIP' || value.includes('SKIP')) return 'skipped';
  if (taskType === 'AUTO_REJECT' || value.includes('REJECT') || value === 'RETURN') return 'rejected';
  return 'finished';
};

const toTimestamp = (value?: string): number => {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const normalizeWorkflowTrace = (trace: Partial<ProcessTrace>): WorkflowTraceNode[] => {
  const historyNodes: WorkflowTraceNode[] = (trace.historyDetails ?? []).map((item, index) => ({
    id: String(item.historyId || item.taskId || item.nodeKey || `history_${index}`),
    nodeKey: String(item.nodeKey || ''),
    name: item.nodeName || '未命名节点',
    type: 'HISTORY',
    taskType: item.taskType,
    nodeType: item.nodeType,
    action: item.action,
    status: getWorkflowActionState(item.action, item.taskType),
    operator: item.operatorId != null ? String(item.operatorId) : undefined,
    operatorName: getWorkflowOperatorLabel(item),
    onBehalfOfUserId: item.onBehalfOfUserId != null ? String(item.onBehalfOfUserId) : undefined,
    onBehalfOfUserName: item.onBehalfOfUserName,
    comment: item.comment,
    time: item.completeTime || item.createTime,
  }));
  const activeNodes: WorkflowTraceNode[] = (trace.activeDetails ?? []).map((item, index) => ({
    id: String(item.taskId || item.nodeKey || `active_${index}`),
    nodeKey: String(item.nodeKey || ''),
    name: item.nodeName || '未命名节点',
    type: 'ACTIVE',
    taskType: item.taskType,
    nodeType: item.nodeType,
    status: 'active',
    operator: item.assigneeId != null ? String(item.assigneeId) : item.assignee != null ? String(item.assignee) : undefined,
    operatorName: item.assigneeName,
    time: item.createTime,
  }));
  return [...historyNodes, ...activeNodes].sort((left, right) => toTimestamp(left.time) - toTimestamp(right.time));
};
