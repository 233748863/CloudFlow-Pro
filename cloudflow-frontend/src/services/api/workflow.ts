/**
 * 工作流 API 服务层
 * 完整的类型定义和错误处理
 */

import request from './request';
import {
  PageResult,
  ProcessInstance,
  ProcessTrace,
  TaskDetail,
  TasksCount,
  ProcessDefinitionListItem,
  ProcessDefinitionDetail,
  FormDefinitionListItem,
  StartProcessRequest,
  CompleteTaskRequest,
  SaveProcessDefinitionRequest,
  SaveProcessDefinitionResponse,
  SaveFormDefinitionRequest,
  UrgeTaskRequest,
  UserBrief,
  RoleInfo,
} from '@/types/workflow';
import {
  Task,
  WorkflowDefinition,
  FormDefinition,
} from '@/types';

// ==================== 工具函数 ====================

/**
 * 从 PageResult 或数组中提取列表
 * 兼容后端返回的不同格式
 */
function extractList<T = any>(res: unknown): T[] {
  // 如果是 PageResult 格式
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    if (Array.isArray(obj.records)) {
      return obj.records as T[];
    }
    if (Array.isArray(obj.rows)) {
      return obj.rows as T[];
    }
  }
  // 如果直接是数组
  if (Array.isArray(res)) {
    return res as T[];
  }
  // 其他情况返回空数组
  return [] as T[];
}

/**
 * 开发环境日志记录
 */
function logApiCall(method: string, endpoint: string, data?: any) {
  if (import.meta.env.DEV) {
    console.log(`[API] ${method} ${endpoint}`, data || '');
  }
}

// ==================== 流程实例相关 API ====================

/**
 * 启动流程
 */
export async function startProcess(data: StartProcessRequest): Promise<ProcessInstance> {
  logApiCall('POST', '/workflow/start', data);
  return request.post('/workflow/start', data);
}

/**
 * 获取流程实例详情
 */
export async function getProcessInstance(instanceId: string): Promise<ProcessInstance> {
  logApiCall('GET', `/workflow/instance/${instanceId}`);
  return request.get(`/workflow/instance/${instanceId}`);
}

/**
 * 获取流程轨迹
 */
export async function getProcessTrace(instanceId: string): Promise<ProcessTrace> {
  logApiCall('GET', `/workflow/instance/${instanceId}/trace`);
  return request.get(`/workflow/instance/${instanceId}/trace`);
}

/**
 * 获取我的申请列表（支持分页和条件查询）
 */
export async function getMyInstances(params?: {
  pageNum?: number;
  pageSize?: number;
  status?: string;         // RUNNING / COMPLETED / REJECTED / REVOKED
  keyword?: string;        // 按标题/流程编号模糊搜索
  processDefKey?: string;  // 流程类型筛选
  startTimeFrom?: string;  // 开始时间范围（起），格式 yyyy-MM-dd
  startTimeTo?: string;    // 开始时间范围（止），格式 yyyy-MM-dd
  priority?: string;       // 优先级筛选：URGENT / HIGH / NORMAL / LOW
  processNo?: string;      // 流程编号搜索
  startUserName?: string;  // 申请人姓名模糊搜索
}): Promise<any> {
  logApiCall('GET', '/workflow/my-instances', params);
  // 将筛选条件放到 params[xxx] 格式，匹配后端 PageQuery.params Map
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  if (params?.status) {
    query['params[status]'] = params.status;
  }
  if (params?.keyword) {
    query['params[keyword]'] = params.keyword;
  }
  if (params?.processDefKey) {
    query['params[processDefKey]'] = params.processDefKey;
  }
  if (params?.startTimeFrom) {
    query['params[startTimeFrom]'] = params.startTimeFrom;
  }
  if (params?.startTimeTo) {
    query['params[startTimeTo]'] = params.startTimeTo;
  }
  if (params?.priority) {
    query['params[priority]'] = params.priority;
  }
  if (params?.processNo) {
    query['params[processNo]'] = params.processNo;
  }
  if (params?.startUserName) {
    query['params[startUserName]'] = params.startUserName;
  }
  return request.get('/workflow/my-instances', { params: query });
}

// ==================== 任务相关 API ====================

/**
 * 获取待办任务列表（支持分页和条件查询）
 * 注意：userId 参数被后端忽略（使用上下文中的当前用户）
 */
export async function getTodoTasks(params?: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;        // 按流程标题/编号模糊搜索
  processDefKey?: string;  // 流程类型筛选
  startTimeFrom?: string;  // 创建时间范围（起），格式 yyyy-MM-dd
  startTimeTo?: string;    // 创建时间范围（止），格式 yyyy-MM-dd
  startUserName?: string;  // 申请人姓名模糊搜索
}): Promise<any> {
  logApiCall('GET', '/workflow/todo', params);
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 999,
  };
  if (params?.keyword) {
    query['params[keyword]'] = params.keyword;
  }
  if (params?.processDefKey) {
    query['params[processDefKey]'] = params.processDefKey;
  }
  if (params?.startTimeFrom) {
    query['params[startTimeFrom]'] = params.startTimeFrom;
  }
  if (params?.startTimeTo) {
    query['params[startTimeTo]'] = params.startTimeTo;
  }
  if (params?.startUserName) {
    query['params[startUserName]'] = params.startUserName;
  }
  return request.get('/workflow/todo', { params: query });
}

/**
 * 完成任务（审批/拒绝/转办等）
 */
export async function completeTask(data: CompleteTaskRequest): Promise<void> {
  logApiCall('POST', '/workflow/complete', data);
  return request.post('/workflow/complete', data);
}

/**
 * 标记任务为已读
 */
export async function readTask(taskId: string): Promise<void> {
  logApiCall('POST', `/workflow/task/read/${taskId}`);
  return request.post(`/workflow/task/read/${taskId}`);
}

/**
 * 催办任务
 */
export async function urgeTask(taskId: string, reason: string): Promise<void> {
  logApiCall('POST', '/workflow/task/urge', { taskId, reason });
  const data: UrgeTaskRequest = { taskId, reason };
  return request.post('/workflow/task/urge', data);
}

/**
 * 驳回任务到指定节点
 */
export async function rejectTask(taskId: string, targetNodeKey: string, comment: string): Promise<void> {
  logApiCall('POST', '/workflow/reject', { taskId, targetNodeKey, comment });
  return request.post('/workflow/reject', {
    taskId,
    targetNodeKey,
    comment
  });
}

/**
 * 撤回流程
 */
export async function recallProcess(instanceId: string): Promise<void> {
  logApiCall('POST', '/workflow/recall', { instanceId });
  return request.post('/workflow/recall', { instanceId });
}

/**
 * 暂停流程
 */
export async function pauseProcess(instanceId: string): Promise<void> {
  logApiCall('POST', '/workflow/pause', { instanceId });
  return request.post('/workflow/pause', { instanceId });
}

/**
 * 恢复流程
 */
export async function resumeProcess(instanceId: string): Promise<void> {
  logApiCall('POST', '/workflow/resume', { instanceId });
  return request.post('/workflow/resume', { instanceId });
}

/**
 * 删除流程定义
 */
export async function deleteProcessDefinition(definitionId: string): Promise<void> {
  logApiCall('DELETE', `/workflow/definition/${definitionId}`);
  return request.delete(`/workflow/definition/${definitionId}`);
}

/**
 * 获取任务统计
 */
export async function getTasksCount(): Promise<TasksCount> {
  logApiCall('GET', '/workflow/tasks/count');
  return request.get('/workflow/tasks/count');
}

/**
 * 获取任务统计详情
 * 包括按时间段、状态、流程类型、处理人的统计，以及平均处理时长和完成率
 */
export async function getTaskStatistics(params?: {
  userId?: number;
  startTime?: string;
  endTime?: string;
}): Promise<Record<string, any>> {
  logApiCall('GET', '/workflow/tasks/statistics', params);
  return request.get('/workflow/tasks/statistics', { params });
}

/**
 * 获取任务分组信息
 * 按流程类型、状态、优先级、处理人等维度分组
 */
export async function getTaskGroups(userId?: number): Promise<Record<string, any>> {
  logApiCall('GET', '/workflow/tasks/groups', { userId });
  return request.get('/workflow/tasks/groups', { params: { userId } });
}

// ==================== 流程定义相关 API ====================

/**
 * 获取流程定义列表
 */
export async function getProcessDefinitions(): Promise<ProcessDefinitionListItem[]> {
  logApiCall('GET', '/workflow/definitions');
  return request.get('/workflow/definitions').then(extractList);
}

/**
 * 获取流程定义详情
 */
export async function getProcessDefinition(definitionId: string): Promise<ProcessDefinitionDetail> {
  logApiCall('GET', `/workflow/definition/${definitionId}`);
  return request.get(`/workflow/definition/${definitionId}`);
}

/**
 * 保存流程定义
 */
export async function saveProcessDefinition(data: SaveProcessDefinitionRequest): Promise<SaveProcessDefinitionResponse> {
  logApiCall('POST', '/workflow/definition/save', data);
  return request.post('/workflow/definition/save', data);
}

/**
 * 发布流程定义
 */
export async function deployProcessDefinition(definitionId: string): Promise<void> {
  logApiCall('POST', `/workflow/definition/deploy/${definitionId}`);
  return request.post(`/workflow/definition/deploy/${definitionId}`);
}

// ==================== 表单定义相关 API ====================

/**
 * 获取表单定义列表
 */
export async function getFormDefinitions(): Promise<FormDefinitionListItem[]> {
  logApiCall('GET', '/workflow/forms');
  return request.get('/workflow/forms').then(extractList);
}

/**
 * 获取表单定义详情
 */
export async function getFormDefinition(formId: string): Promise<FormDefinition> {
  logApiCall('GET', `/workflow/form/${formId}`);
  return request.get(`/workflow/form/${formId}`);
}

/**
 * 保存表单定义
 */
export async function saveFormDefinition(data: SaveFormDefinitionRequest): Promise<FormDefinition> {
  logApiCall('POST', '/workflow/form/save', data);
  return request.post('/workflow/form/save', data);
}

// ==================== 用户和角色相关 API ====================

/**
 * 获取用户列表（用于选择审批人等）
 * Gateway route: /auth/** → cloudflow-auth (StripPrefix=1)
 */
export async function getUsers(): Promise<UserBrief[]> {
  logApiCall('GET', '/auth/system/user/list');
  return request.get('/auth/system/user/list').then(extractList);
}

/**
 * 获取角色列表
 * Gateway route: /auth/** → cloudflow-auth (StripPrefix=1)
 */
export async function getRoles(): Promise<RoleInfo[]> {
  logApiCall('GET', '/auth/system/role/list');
  return request.get('/auth/system/role/list').then(extractList);
}

// ==================== 流程抄送相关 API ====================

/**
 * 获取"抄送我的"列表（分页）
 */
export async function getMyCopyList(params?: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  isRead?: number;         // 0-未读 1-已读
  processDefKey?: string;
}): Promise<any> {
  logApiCall('GET', '/workflow/copy/list', params);
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  if (params?.keyword) query['params[keyword]'] = params.keyword;
  if (params?.isRead !== undefined) query['params[isRead]'] = params.isRead;
  if (params?.processDefKey) query['params[processDefKey]'] = params.processDefKey;
  return request.get('/workflow/copy/list', { params: query });
}

/**
 * 获取未读抄送数量
 */
export async function getCopyUnreadCount(): Promise<number> {
  logApiCall('GET', '/workflow/copy/unread-count');
  return request.get('/workflow/copy/unread-count');
}

/**
 * 标记抄送为已读
 */
export async function markCopyAsRead(copyId: number): Promise<void> {
  logApiCall('POST', `/workflow/copy/read/${copyId}`);
  return request.post(`/workflow/copy/read/${copyId}`);
}

/**
 * 批量标记抄送为已读
 */
export async function batchMarkCopyAsRead(copyIds: number[]): Promise<void> {
  logApiCall('POST', '/workflow/copy/batch-read', copyIds);
  // 后端期望 { copyIds: [...] } 格式
  return request.post('/workflow/copy/batch-read', { copyIds });
}

// ==================== P1 增强功能 API ====================

/**
 * 加签请求参数
 */
export interface AddSignRequest {
  taskId: string;
  signType: 'BEFORE' | 'AFTER' | 'PARALLEL'; // 前加签/后加签/并行加签
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
  mode: 'TRANSFER' | 'DELEGATE'; // 直接转办 / 委派后回到委派人
  reason?: string;
}

/**
 * 作废流程请求参数
 */
export interface InvalidateProcessRequest {
  instanceId: string;
  reason: string;
}

/**
 * 流程图节点
 */
export interface FlowchartNode {
  id: string;
  type: string;
  label: string;
  status?: 'completed' | 'active' | 'pending';
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
  status?: 'active' | 'pending';
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
 * 加签（动态增加审批人）
 * 仅支持会签节点，只有任务处理人可以加签
 */
export async function addSignature(taskId: string, userIds: number[], comment: string): Promise<void> {
  logApiCall('POST', '/workflow/task/add-signature', { taskId, userIds, comment });
  return request.post('/workflow/task/add-signature', {
    taskId,
    userIds,
    comment
  });
}

/**
 * 减签（动态减少审批人）
 * 仅支持会签节点，任务处理人或管理员可以减签
 */
export async function reductionSignature(taskId: string, userIds: number[], comment: string): Promise<void> {
  logApiCall('POST', '/workflow/task/reduction-signature', { taskId, userIds, comment });
  return request.post('/workflow/task/reduction-signature', {
    taskId,
    userIds,
    comment
  });
}

/**
 * P1-4: 加签（旧版，保留兼容）
 */
export async function addSign(data: AddSignRequest): Promise<string> {
  logApiCall('POST', '/workflow/enhance/task/addSign', data);
  return request.post('/workflow/enhance/task/addSign', data);
}

/**
 * P1-4: 减签（旧版，保留兼容）
 */
export async function removeSign(data: RemoveSignRequest): Promise<number> {
  logApiCall('POST', '/workflow/enhance/task/removeSign', data);
  return request.post('/workflow/enhance/task/removeSign', data);
}

/**
 * P1-5: 委派任务（支持直接转办和委派后回到委派人两种模式）
 */
export async function delegateTask(data: DelegateTaskRequest): Promise<void> {
  logApiCall('POST', '/workflow/enhance/task/delegate', data);
  return request.post('/workflow/enhance/task/delegate', data);
}

/**
 * P1-6: 获取流程图数据（实例级别，含运行时状态）
 */
export async function getFlowchartData(instanceId: string): Promise<FlowchartData> {
  logApiCall('GET', `/workflow/enhance/flowchart/${instanceId}`);
  return request.get(`/workflow/enhance/flowchart/${instanceId}`);
}

/**
 * P1-6: 获取流程图结构（定义级别，仅结构）
 */
export async function getFlowchartStructure(definitionId: string): Promise<FlowchartStructure> {
  logApiCall('GET', `/workflow/enhance/flowchart/definition/${definitionId}`);
  return request.get(`/workflow/enhance/flowchart/definition/${definitionId}`);
}

/**
 * P1-7: 作废流程
 */
export async function invalidateProcess(data: InvalidateProcessRequest): Promise<{ deletedTasks: number }> {
  logApiCall('POST', '/workflow/enhance/instance/invalidate', data);
  return request.post('/workflow/enhance/instance/invalidate', data);
}

/**
 * 终止流程请求参数
 */
export interface TerminateProcessRequest {
  instanceId: string;
  reason: string;
}

/**
 * P1-3: 终止流程（管理员强制终止异常流程）
 */
export async function terminateProcess(data: TerminateProcessRequest): Promise<{ instanceId: string; deletedTasks: number; reason: string; message: string }> {
  logApiCall('POST', '/workflow/instance/terminate', data);
  return request.post('/workflow/instance/terminate', data);
}

// ==================== 导出所有 API ====================

export default {
  // 流程实例
  startProcess,
  getProcessInstance,
  getProcessTrace,
  getMyInstances,
  
  // 任务
  getTodoTasks,
  completeTask,
  readTask,
  urgeTask,
  rejectTask,
  getTasksCount,
  getTaskStatistics,
  getTaskGroups,
  
  // 流程控制
  recallProcess,
  pauseProcess,
  resumeProcess,
  
  // 流程定义
  getProcessDefinitions,
  getProcessDefinition,
  saveProcessDefinition,
  deployProcessDefinition,
  deleteProcessDefinition,
  
  // 表单定义
  getFormDefinitions,
  getFormDefinition,
  saveFormDefinition,
  
  // 用户和角色
  getUsers,
  getRoles,

  // 流程抄送
  getMyCopyList,
  getCopyUnreadCount,
  markCopyAsRead,
  batchMarkCopyAsRead,

  // P1 增强功能
  addSign,
  removeSign,
  delegateTask,
  getFlowchartData,
  getFlowchartStructure,
  invalidateProcess,
};
