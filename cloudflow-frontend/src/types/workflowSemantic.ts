export const WORKFLOW_TASK_TYPES = [
  'APPROVAL', 'CC', 'MANUAL', 'COUNTERSIGN', 'OR_SIGN', 'PERCENT_SIGN',
  'SEQUENTIAL_SIGN', 'WEIGHT_SIGN', 'TRANSFER', 'DELEGATE', 'DELEGATE_RETURN',
  'ADD_SIGN', 'REDUCE_SIGN', 'REJECT', 'REJECT_JUMP', 'AUTO_PASS', 'AUTO_REJECT', 'AUTO_SKIP',
] as const;

export type WorkflowTaskType = (typeof WORKFLOW_TASK_TYPES)[number];
export type RejectStrategy = 'TO_INITIATOR' | 'TO_PREVIOUS_NODE' | 'TO_SPECIFIED_NODE' | 'TERMINATE' | 'TO_PARENT_NODE';
export type SelfApprovalStrategy = 'ALLOW' | 'AUTO_SKIP' | 'TO_DIRECT_LEADER' | 'TO_DEPT_MANAGER';

export interface NodeOperationPermissions {
  allowAddSign?: boolean;
  allowReduceSign?: boolean;
  allowDelegate?: boolean;
  allowUrge?: boolean;
  allowRollback?: boolean;
  allowCc?: boolean;
  allowSelection?: boolean;
}

export interface SelectableScope {
  roleIds?: Array<number | string>;
  deptIds?: Array<number | string>;
}

export interface AssigneeWeight {
  userId?: number | string;
  jobLevelId?: number | string;
  weight: number | string;
}

export interface WorkflowNodeSemantics extends NodeOperationPermissions {
  rejectStrategy?: RejectStrategy;
  rejectToNodeKey?: string;
  approveSelf?: SelfApprovalStrategy;
  directorLevel?: number;
  directorFallback?: 'TOP_LEVEL' | 'SKIP' | 'FAIL';
  selectableScope?: SelectableScope;
  passWeight?: number | string;
  weightSource?: 'EQUAL' | 'BY_JOB_LEVEL' | 'BY_CONFIG';
  assigneeWeights?: AssigneeWeight[];
}

export interface NodeOption {
  nodeKey: string;
  nodeName: string;
}

export interface StartAssigneeNode extends NodeOption {
  selectableScope: SelectableScope;
  multiple: boolean;
  candidates: Array<{ userId: string; userName: string }>;
}

export interface FieldPermission {
  nodeKey: string;
  fieldId: string;
  visibleFlag: boolean;
  editableFlag: boolean;
  requiredFlag?: boolean | null;
}

export const REJECT_STRATEGY_LABELS: Record<RejectStrategy, string> = {
  TO_INITIATOR: '退回发起人修改',
  TO_PREVIOUS_NODE: '退回上一个审批节点',
  TO_SPECIFIED_NODE: '退回指定上游节点',
  TERMINATE: '直接结束流程',
  TO_PARENT_NODE: '退回父流程节点',
};

export const NODE_OPERATION_LABELS: Record<keyof NodeOperationPermissions, string> = {
  allowAddSign: '加签：允许增加审批人',
  allowReduceSign: '减签：允许移除未处理的审批人',
  allowDelegate: '委派或转办：允许交给其他人处理',
  allowUrge: '催办：允许发起人发送提醒',
  allowRollback: '回退：允许退回上游或发起人',
  allowCc: '抄送：允许添加知会人',
  allowSelection: '选人：允许发起时指定审批人',
};
