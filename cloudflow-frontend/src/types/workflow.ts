/**
 * 工作流相关类型定义
 * 完整的 TypeScript 类型定义，避免使用 any
 */

import { 
  WorkflowDefinition, 
  FormDefinition, 
  Task, 
  TaskStatus,
  WorkflowNode,
  Role 
} from '../types';

// ==================== API 响应类型 ====================

/**
 * 分页结果
 */
export interface PageResult<T> {
  total: number;
  records: T[];
  rows?: T[]; // 兼容不同后端返回格式
}

/**
 * 标准 API 响应
 */
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

// ==================== 流程实例相关类型 ====================

/**
 * 流程实例状态
 */
export enum ProcessInstanceStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
  SUSPENDED = 'SUSPENDED'
}

/**
 * 流程实例
 */
export interface ProcessInstance {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  status: ProcessInstanceStatus;
  applicantId: string;
  applicantName: string;
  formId?: string;
  formData?: Record<string, any>;
  currentNodeKey?: string;
  currentNodeName?: string;
  startTime: string;
  endTime?: string;
  variables?: Record<string, any>;
}

/**
 * 流程轨迹节点状态
 */
export enum TraceNodeStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  SKIPPED = 'SKIPPED'
}

/**
 * 流程轨迹节点
 */
export interface ProcessTraceNode extends WorkflowNode {
  status: TraceNodeStatus;
  assigneeId?: string;
  assigneeName?: string;
  startTime?: string;
  endTime?: string;
  comment?: string;
  // 递归结构
  next?: ProcessTraceNode;
  branches?: ProcessTraceNode[];
}

/**
 * 流程轨迹历史详情
 */
export interface ProcessTraceHistoryDetail {
  historyId: string;
  taskId: string;
  nodeKey: string;
  nodeName: string;
  operatorId: string;
  operatorName: string;
  action: string;
  comment?: string;
  createTime: string;
}

/**
 * 流程轨迹活动任务详情
 */
export interface ProcessTraceActiveDetail {
  taskId: string;
  nodeKey: string;
  nodeName: string;
  assignee: string;
  assigneeName?: string;
  status: string;
  createTime: string;
}

/**
 * 流程轨迹
 */
export interface ProcessTrace {
  instanceId?: string;
  workflowName?: string;
  status?: ProcessInstanceStatus;
  applicantId?: string;
  applicantName?: string;
  startTime?: string;
  endTime?: string;
  nodes?: ProcessTraceNode;
  logs?: ProcessLog[];
  // 后端实际返回的字段
  finished: string[];
  active: string[];
  historyDetails?: ProcessTraceHistoryDetail[];
  activeDetails?: ProcessTraceActiveDetail[];
  parallelBranches?: Array<{
    branchId?: string;
    branchName?: string;
    nodeKeys?: string[];
    status?: string;
  }>;
}

/**
 * 流程日志
 */
export interface ProcessLog {
  id: string;
  instanceId: string;
  nodeKey: string;
  nodeName: string;
  operatorId: string;
  operatorName: string;
  action: string;
  comment?: string;
  timestamp: string;
}

// ==================== 任务相关类型 ====================

/**
 * 任务详情（扩展 Task 类型）
 */
export interface TaskDetail extends Task {
  processInstance?: ProcessInstance;
  formDefinition?: FormDefinition;
  canApprove: boolean;
  canReject: boolean;
  canDelegate: boolean;
  canEdit: boolean;
}

/**
 * 任务统计
 */
export interface TasksCount {
  pending: number;
  completed: number;
  myApplications: number;
}

// ==================== 流程定义相关类型 ====================

/**
 * 流程定义列表项
 */
export interface ProcessDefinitionListItem {
  id: string;
  name: string;
  key: string;
  version: number;
  formId?: string;
  formName?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createTime: string;
  updateTime: string;
  // 后端实际返回的字段名（兼容）
  processKey?: string;
  processName?: string;
  definitionId?: string;
  category?: string;
}

/**
 * 流程定义详情
 */
export interface ProcessDefinitionDetail extends WorkflowDefinition {
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createTime: string;
  updateTime: string;
  creatorId: string;
  creatorName: string;
}

// ==================== 表单定义相关类型 ====================

/**
 * 表单定义列表项
 */
export interface FormDefinitionListItem {
  id: string;
  name: string;
  fieldCount: number;
  createTime: string;
  updateTime: string;
}

// ==================== API 请求参数类型 ====================

/**
 * 启动流程请求
 */
export interface StartProcessRequest {
  processDefKey: string;
  businessKey?: string;
  title?: string;
  startUserId?: string;
  startUserName?: string;
  variables?: Record<string, any>;
}

/**
 * 完成任务请求
 */
export interface CompleteTaskRequest {
  taskId: string;
  action: 'APPROVE' | 'REJECT' | 'DELEGATE' | 'RETURN';
  comment?: string;
  delegateUserId?: string;
  modifiedData?: Record<string, any>;
  variables?: Record<string, any>;
}

/**
 * 保存流程定义请求
 */
export interface SaveProcessDefinitionRequest {
  definitionId?: string;
  processName: string;
  processKey: string;
  formId?: string;
  modelJson: string;
  description?: string;           // P1: 流程描述
  category?: string;              // P1: 流程分类
  tags?: string;                  // P1: 流程标签（JSON 数组字符串）
  startPermissionType?: string;   // P1: 启动权限类型 (ALL/ROLE/DEPT/USER)
  startPermissionValue?: string;  // P1: 启动权限值
  deptId?: number;                // P1: 部门ID（数据权限）
}

/**
 * 保存流程定义响应
 */
export interface SaveProcessDefinitionResponse {
  id: string;
  version: number;
  processKey: string;
}

/**
 * 保存表单定义请求
 */
export interface SaveFormDefinitionRequest {
  formId?: string;
  formName: string;
  fieldsJson: string; // JSON 字符串，而不是数组
}

/**
 * 催办请求
 */
export interface UrgeTaskRequest {
  taskId: string;
  reason: string;
}

// ==================== 用户和角色相关类型 ====================

/**
 * 用户简要信息
 */
export interface UserBrief {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  deptId?: string;
  deptName?: string;
}

/**
 * 角色信息
 */
export interface RoleInfo {
  id: string;
  name: string;
  code: Role;
  description?: string;
}

// ==================== 工具函数类型 ====================

/**
 * 从 PageResult 或数组中提取列表
 */
export type ExtractList<T> = T extends PageResult<infer U> 
  ? U[] 
  : T extends Array<infer U> 
    ? U[] 
    : T[];

/**
 * API 错误
 */
export class ApiError extends Error {
  constructor(
    public code: number,
    public msg: string,
    public data?: unknown
  ) {
    super(msg);
    this.name = 'ApiError';
  }
}

// ==================== 常量枚举 ====================

/**
 * 任务操作类型
 */
export enum TaskAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  DELEGATE = 'DELEGATE',
  RETURN = 'RETURN',
  MODIFY = 'MODIFY'
}

/**
 * 流程定义状态
 */
export enum ProcessDefinitionStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED'
}
