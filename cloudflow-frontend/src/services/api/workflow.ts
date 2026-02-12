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
export async function saveProcessDefinition(data: SaveProcessDefinitionRequest): Promise<WorkflowDefinition> {
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
};
