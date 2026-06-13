// ============================================================================
// workflow 模块本地补充类型（不在 @/types/workflow 全局类型中的请求/响应类型）
// ============================================================================

export interface RejectTaskRequest {
  taskId: string;
  targetNodeKey: string;
  comment: string;
}

export interface InstanceIdRequest {
  instanceId: string;
}

export interface BatchCopyReadRequest {
  copyIds: number[];
}

// ===== P1 增强：加签 / 减签 / 委派 / 流程图 / 作废 / 终止 =====

/**
 * 加签请求参数
 */
export interface AddSignRequest {
  taskId: string;
  signType: "BEFORE" | "AFTER" | "PARALLEL";
  userIds: number[];
  userNames: string[];
  reason?: string;
}

/**
 * 减签请求参数
 */
export interface RemoveSignRequest {
  taskId: string;
  userIds: number[];
  reason?: string;
}

/**
 * 委派任务请求参数
 */
export interface DelegateTaskRequest {
  taskId: string;
  toUserId: number;
  toUserName: string;
  mode: "TRANSFER" | "DELEGATE";
  reason?: string;
}

/**
 * 作废流程请求参数
 */
export interface InvalidateProcessRequest {
  instanceId: string;
  reason: string;
}

export interface SignatureChangeRequest {
  taskId: string;
  userIds: number[];
  comment: string;
}

/**
 * 流程图节点
 */
export interface FlowchartNode {
  id: string;
  type: string;
  label: string;
  status?: "completed" | "active" | "pending";
  x: number;
  y: number;
  icon?: string;
  approverType?: string;
  approverValue?: string;
  condition?: string;
}

/**
 * 流程图连线
 */
export interface FlowchartEdge {
  id: string;
  source: string;
  target: string;
  status?: "active" | "pending";
  label?: string;
}

/**
 * 流程图数据（实例级别，含运行时状态）
 */
export interface FlowchartData {
  instanceId: string;
  processStatus: string;
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

/**
 * 流程图结构（定义级别，仅结构）
 */
export interface FlowchartStructure {
  definitionId: string;
  processKey: string;
  processName: string;
  version: number;
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

/**
 * 终止流程请求参数
 */
export interface TerminateProcessRequest {
  instanceId: string;
  reason: string;
}

// ===== 流程导入导出 =====

export interface BatchExportRequest {
  workflowIds: string[];
  includeSensitive: boolean;
}

export interface ImportResult {
  success: boolean;
  workflowId?: string;
  workflowName: string;
  action: "created" | "updated" | "skipped" | "failed";
  errors?: string[];
  warnings?: string[];
  message?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  workflowName?: string;
  version?: string;
  unsupportedNodeTypes?: string[];
}

// ===== 批量操作 =====

export interface BatchArchiveRequest {
  workflowIds: string[];
  reason: string;
}

export interface OperationDetail {
  workflowId: string;
  workflowName: string;
  status: "success" | "failed" | "skipped";
  message?: string;
}

export interface BatchOperationResult {
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  details: OperationDetail[];
}

export interface SafetyCheckResult {
  safe: boolean;
  message?: string;
  warnings: string[];
  errors: string[];
  workflowsWithRunningInstances: string[];
  workflowsWithDependencies: string[];
  workflowsWithoutPermission: string[];
  details: Record<string, string>;
}

// ===== 流程模拟测试 =====

export interface SimulationRequest {
  definitionId: string;
  variables?: Record<string, unknown>;
  simulateAllBranches?: boolean;
  maxDepth?: number;
}

export interface SimulationNodeDetail {
  nodeId: string;
  nodeType: string;
  title: string;
  reached: boolean;
  conditionResult?: boolean;
  resolvedAssignees: string[];
  branchTaken?: string;
  warnings: string[];
}

export interface SimulationPath {
  nodeIds: string[];
  nodeTitles: string[];
  terminationType: string;
}

export interface SimulationResult {
  success: boolean;
  paths: SimulationPath[];
  warnings: string[];
  errors: string[];
  nodeDetails: SimulationNodeDetail[];
  totalNodes: number;
  reachableNodes: number;
  unreachableNodes: string[];
}

// ===== 流程热更新 =====

export interface HotUpdateRequest {
  processKey: string;
  targetVersion?: number;
  migrationMode: 'COMPATIBLE' | 'FORCE' | 'RESTART';
  instanceIds?: string[];
  confirmToken?: string;
  dryRun?: boolean;
}

export interface HotUpdateInstanceDetail {
  instanceId: string;
  processNo: string;
  currentNodeKey: string;
  currentNodeTitle: string;
  status: 'MIGRATED' | 'SKIPPED' | 'FAILED' | 'RESTARTED';
  reason?: string;
  newInstanceId?: string;
}

export interface HotUpdateResult {
  success: boolean;
  totalInstances: number;
  migratedCount: number;
  skippedCount: number;
  failedCount: number;
  details: HotUpdateInstanceDetail[];
  fromVersion: number;
  toVersion: number;
  confirmToken?: string;
  confirmExpireSeconds?: number;
  message?: string;
}

export interface HotUpdateRecord {
  id: number;
  processKey: string;
  fromVersion: number;
  toVersion: number;
  migrationMode: string;
  totalInstances: number;
  migratedCount: number;
  skippedCount: number;
  failedCount: number;
  executedBy: string;
  executedAt: string;
}
