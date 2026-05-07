/**
 * 工作流 API 服务层
 * 完整的类型定义和错误处理
 */

import request from "./request";
import { getRoleOptions } from "./auth";
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
} from "@/types/workflow";
import { Task, WorkflowDefinition, FormDefinition } from "@/types";

// ==================== 工具函数 ====================

/**
 * 从 PageResult 或数组中提取列表
 * 兼容后端返回的不同格式
 */
function extractList<T = any>(res: unknown): T[] {
  // 如果是 PageResult 格式
  if (res && typeof res === "object") {
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
    console.log(`[API] ${method} ${endpoint}`, data || "");
  }
}

/**
 * 归档时间参数标准化：
 * 日期输入（yyyy-MM-dd）自动扩展为当天边界时间，便于后端按时间段精确筛选。
 */
function normalizeArchiveDateTime(value: string, isEnd: boolean): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} ${isEnd ? "23:59:59" : "00:00:00"}`;
  }
  return trimmed;
}

// ==================== 流程实例相关 API ====================

/**
 * 启动流程
 */
export async function startProcess(
  data: StartProcessRequest,
): Promise<ProcessInstance> {
  const variables: Record<string, any> = { ...(data.variables || {}) };
  if (data.title && !Object.prototype.hasOwnProperty.call(variables, "_title")) {
    variables._title = data.title;
  }

  // 后端仅接收 processDefKey/businessKey/variables，前端在此完成字段归一化
  const payload = {
    processDefKey: data.processDefKey,
    businessKey: data.businessKey,
    variables,
  };
  logApiCall("POST", "/workflow/start", payload);
  return request.post("/workflow/start", payload);
}

/**
 * 获取流程实例详情
 */
export async function getProcessInstance(
  instanceId: string,
): Promise<ProcessInstance> {
  logApiCall("GET", `/workflow/instance/${instanceId}`);
  return request.get(`/workflow/instance/${instanceId}`);
}

/**
 * 获取流程轨迹
 */
export async function getProcessTrace(
  instanceId: string,
): Promise<ProcessTrace> {
  logApiCall("GET", `/workflow/instance/${instanceId}/trace`);
  return request.get(`/workflow/instance/${instanceId}/trace`);
}

/**
 * 获取我的申请列表（支持分页和条件查询）
 */
export async function getMyInstances(params?: {
  pageNum?: number;
  pageSize?: number;
  status?: string; // RUNNING / COMPLETED / REJECTED / REVOKED
  keyword?: string; // 按标题/流程编号模糊搜索
  processDefKey?: string; // 流程类型筛选
  startTimeFrom?: string; // 开始时间范围（起），格式 yyyy-MM-dd
  startTimeTo?: string; // 开始时间范围（止），格式 yyyy-MM-dd
  priority?: string; // 优先级筛选：URGENT / HIGH / NORMAL / LOW
  processNo?: string; // 流程编号搜索
  startUserName?: string; // 申请人姓名模糊搜索
}): Promise<any> {
  logApiCall("GET", "/workflow/my-instances", params);
  // 将筛选条件放到 params[xxx] 格式，匹配后端 PageQuery.params Map
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  if (params?.status) {
    query["params[status]"] = params.status;
  }
  if (params?.keyword) {
    query["params[keyword]"] = params.keyword;
  }
  if (params?.processDefKey) {
    query["params[processDefKey]"] = params.processDefKey;
  }
  if (params?.startTimeFrom) {
    query["params[startTimeFrom]"] = params.startTimeFrom;
  }
  if (params?.startTimeTo) {
    query["params[startTimeTo]"] = params.startTimeTo;
  }
  if (params?.priority) {
    query["params[priority]"] = params.priority;
  }
  if (params?.processNo) {
    query["params[processNo]"] = params.processNo;
  }
  if (params?.startUserName) {
    query["params[startUserName]"] = params.startUserName;
  }
  return request.get("/workflow/my-instances", { params: query });
}

// ==================== 任务相关 API ====================

/**
 * 获取待办任务列表（支持分页和条件查询）
 * 注意：userId 参数被后端忽略（使用上下文中的当前用户）
 */
export async function getTodoTasks(params?: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string; // 按流程标题/编号模糊搜索
  processDefKey?: string; // 流程类型筛选
  startTimeFrom?: string; // 创建时间范围（起），格式 yyyy-MM-dd
  startTimeTo?: string; // 创建时间范围（止），格式 yyyy-MM-dd
  startUserName?: string; // 申请人姓名模糊搜索
}): Promise<any> {
  logApiCall("GET", "/workflow/todo", params);
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 999,
  };
  if (params?.keyword) {
    query["params[keyword]"] = params.keyword;
  }
  if (params?.processDefKey) {
    query["params[processDefKey]"] = params.processDefKey;
  }
  if (params?.startTimeFrom) {
    query["params[startTimeFrom]"] = params.startTimeFrom;
  }
  if (params?.startTimeTo) {
    query["params[startTimeTo]"] = params.startTimeTo;
  }
  if (params?.startUserName) {
    query["params[startUserName]"] = params.startUserName;
  }
  return request.get("/workflow/todo", { params: query });
}

/**
 * 获取已办任务列表（支持分页和条件查询）
 */
export async function getDoneTasks(params?: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  processDefKey?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  startUserName?: string;
}): Promise<any> {
  logApiCall("GET", "/workflow/done", params);
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  if (params?.keyword) query["params[keyword]"] = params.keyword;
  if (params?.processDefKey) query["params[processDefKey]"] = params.processDefKey;
  if (params?.startTimeFrom) query["params[startTimeFrom]"] = params.startTimeFrom;
  if (params?.startTimeTo) query["params[startTimeTo]"] = params.startTimeTo;
  if (params?.startUserName) query["params[startUserName]"] = params.startUserName;
  return request.get("/workflow/done", { params: query });
}

/**
 * 完成任务（审批/拒绝/转办等）
 */
export async function completeTask(data: CompleteTaskRequest): Promise<void> {
  logApiCall("POST", "/workflow/complete", data);
  return request.post("/workflow/complete", data);
}

/**
 * 标记任务为已读
 */
export async function readTask(taskId: string): Promise<void> {
  logApiCall("POST", `/workflow/task/read/${taskId}`);
  return request.post(`/workflow/task/read/${taskId}`);
}

/**
 * 催办任务
 */
export async function urgeTask(taskId: string, reason: string): Promise<void> {
  logApiCall("POST", "/workflow/task/urge", { taskId, reason });
  const data: UrgeTaskRequest = { taskId, reason };
  return request.post("/workflow/task/urge", data);
}

export interface RejectTaskRequest {
  taskId: string;
  targetNodeKey: string;
  comment: string;
}

export interface InstanceIdRequest {
  instanceId: string;
}

/**
 * 驳回任务到指定节点
 */
export async function rejectTask(
  taskId: string,
  targetNodeKey: string,
  comment: string,
): Promise<void> {
  logApiCall("POST", "/workflow/reject", { taskId, targetNodeKey, comment });
  const data: RejectTaskRequest = { taskId, targetNodeKey, comment };
  return request.post("/workflow/reject", data);
}

/**
 * 撤回流程
 */
export async function recallProcess(instanceId: string): Promise<void> {
  logApiCall("POST", "/workflow/recall", { instanceId });
  const data: InstanceIdRequest = { instanceId };
  return request.post("/workflow/recall", data);
}

/**
 * 暂停流程
 */
export async function pauseProcess(instanceId: string): Promise<void> {
  logApiCall("POST", "/workflow/pause", { instanceId });
  const data: InstanceIdRequest = { instanceId };
  return request.post("/workflow/pause", data);
}

/**
 * 恢复流程
 */
export async function resumeProcess(instanceId: string): Promise<void> {
  logApiCall("POST", "/workflow/resume", { instanceId });
  const data: InstanceIdRequest = { instanceId };
  return request.post("/workflow/resume", data);
}

/**
 * 删除流程定义
 */
export async function deleteProcessDefinition(
  definitionId: string,
): Promise<void> {
  logApiCall("DELETE", `/workflow/definition/${definitionId}`);
  return request.delete(`/workflow/definition/${definitionId}`);
}

/**
 * 获取任务统计
 */
export async function getTasksCount(): Promise<TasksCount> {
  logApiCall("GET", "/workflow/tasks/count");
  return request.get("/workflow/tasks/count");
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
  logApiCall("GET", "/workflow/tasks/statistics", params);
  return request.get("/workflow/tasks/statistics", { params });
}

/**
 * 获取任务分组信息
 * 按流程类型、状态、优先级、处理人等维度分组
 */
export async function getTaskGroups(
  userId?: number,
): Promise<Record<string, any>> {
  logApiCall("GET", "/workflow/tasks/groups", { userId });
  return request.get("/workflow/tasks/groups", { params: { userId } });
}

// ==================== 流程定义相关 API ====================

/**
 * 获取流程定义列表
 */
export async function getProcessDefinitions(params?: {
  pageNum?: number;
  pageSize?: number;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  latestOnly?: boolean;
}): Promise<ProcessDefinitionListItem[]> {
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 500,
  };
  if (params?.status) {
    query["params[status]"] = params.status;
  }
  if (params?.latestOnly === false) {
    query["params[latestOnly]"] = "false";
  }

  logApiCall("GET", "/workflow/definitions", query);
  return request.get("/workflow/definitions", { params: query }).then(extractList);
}

/**
 * 获取流程定义详情
 */
export async function getProcessDefinition(
  definitionId: string,
): Promise<ProcessDefinitionDetail> {
  logApiCall("GET", `/workflow/definition/${definitionId}`);
  return request.get(`/workflow/definition/${definitionId}`);
}

/**
 * 保存流程定义
 */
export async function saveProcessDefinition(
  data: SaveProcessDefinitionRequest,
): Promise<SaveProcessDefinitionResponse> {
  logApiCall("POST", "/workflow/definition/save", data);
  return request.post("/workflow/definition/save", data);
}

/**
 * 发布流程定义
 */
export async function deployProcessDefinition(
  definitionId: string,
): Promise<void> {
  logApiCall("POST", `/workflow/definition/deploy/${definitionId}`);
  return request.post(`/workflow/definition/deploy/${definitionId}`);
}

// ==================== 表单定义相关 API ====================

/**
 * 获取表单定义列表
 */
export async function getFormDefinitions(): Promise<FormDefinitionListItem[]> {
  logApiCall("GET", "/workflow/forms");
  return request.get("/workflow/forms").then(extractList);
}

/**
 * 获取表单定义详情
 */
export async function getFormDefinition(
  formId: string,
): Promise<FormDefinition> {
  logApiCall("GET", `/workflow/form/${formId}`);
  return request.get(`/workflow/form/${formId}`);
}

/**
 * 保存表单定义
 */
export async function saveFormDefinition(
  data: SaveFormDefinitionRequest,
): Promise<FormDefinition> {
  logApiCall("POST", "/workflow/form/save", data);
  return request.post("/workflow/form/save", data);
}

// ==================== 用户和角色相关 API ====================

/**
 * 获取用户列表（用于选择审批人等）
 * Gateway route: /auth/** → cloudflow-auth (StripPrefix=1)
 */
export async function getUsers(): Promise<UserBrief[]> {
  logApiCall("GET", "/auth/system/user/list");
  return request.get("/auth/system/user/list").then(extractList);
}

/**
 * 获取角色列表
 * Gateway route: /auth/** → cloudflow-auth (StripPrefix=1)
 */
export async function getRoles(): Promise<RoleInfo[]> {
  logApiCall("GET", "/auth/system/role/optionselect");
  const roles = await getRoleOptions();
  return roles.map((role) => ({
    id: String(role.roleId),
    name: role.roleName,
    code: role.roleKey,
    key: role.roleKey,
    roleKey: role.roleKey,
  }));
}

// ==================== 流程抄送相关 API ====================

/**
 * 获取"抄送我的"列表（分页）
 */
export async function getMyCopyList(params?: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  isRead?: number; // 0-未读 1-已读
  processDefKey?: string;
}): Promise<any> {
  logApiCall("GET", "/workflow/copy/list", params);
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  if (params?.keyword) query["params[keyword]"] = params.keyword;
  if (params?.isRead !== undefined) query["params[isRead]"] = params.isRead;
  if (params?.processDefKey)
    query["params[processDefKey]"] = params.processDefKey;
  return request.get("/workflow/copy/list", { params: query });
}

/**
 * 获取未读抄送数量
 */
export async function getCopyUnreadCount(): Promise<number> {
  logApiCall("GET", "/workflow/copy/unread-count");
  return request.get("/workflow/copy/unread-count");
}

/**
 * 标记抄送为已读
 */
export async function markCopyAsRead(copyId: number): Promise<void> {
  logApiCall("POST", `/workflow/copy/read/${copyId}`);
  return request.post(`/workflow/copy/read/${copyId}`);
}

/**
 * 批量标记抄送为已读
 */
export async function batchMarkCopyAsRead(copyIds: number[]): Promise<void> {
  logApiCall("POST", "/workflow/copy/batch-read", copyIds);
  const data: BatchCopyReadRequest = { copyIds };
  return request.post("/workflow/copy/batch-read", data);
}

export interface BatchCopyReadRequest {
  copyIds: number[];
}

// ==================== P1 增强功能 API ====================

/**
 * 加签请求参数
 */
export interface AddSignRequest {
  taskId: string;
  signType: "BEFORE" | "AFTER" | "PARALLEL"; // 前加签/后加签/并行加签
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
  mode: "TRANSFER" | "DELEGATE"; // 直接转办 / 委派后回到委派人
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
 * 加签（动态增加审批人）
 * 仅支持会签节点，只有任务处理人可以加签
 */
export async function addSignature(
  taskId: string,
  userIds: number[],
  comment: string,
): Promise<void> {
  logApiCall("POST", "/workflow/task/add-signature", {
    taskId,
    userIds,
    comment,
  });
  const data: SignatureChangeRequest = { taskId, userIds, comment };
  return request.post("/workflow/task/add-signature", data);
}

/**
 * 减签（动态减少审批人）
 * 仅支持会签节点，任务处理人或管理员可以减签
 */
export async function reductionSignature(
  taskId: string,
  userIds: number[],
  comment: string,
): Promise<void> {
  logApiCall("POST", "/workflow/task/reduction-signature", {
    taskId,
    userIds,
    comment,
  });
  const data: SignatureChangeRequest = { taskId, userIds, comment };
  return request.post("/workflow/task/reduction-signature", data);
}

/**
 * P1-4: 加签（旧版，保留兼容）
 */
export async function addSign(data: AddSignRequest): Promise<string> {
  logApiCall("POST", "/workflow/enhance/task/addSign", data);
  return request.post("/workflow/enhance/task/addSign", data);
}

/**
 * P1-4: 减签（旧版，保留兼容）
 */
export async function removeSign(data: RemoveSignRequest): Promise<number> {
  logApiCall("POST", "/workflow/enhance/task/removeSign", data);
  return request.post("/workflow/enhance/task/removeSign", data);
}

/**
 * P1-5: 委派任务（支持直接转办和委派后回到委派人两种模式）
 */
export async function delegateTask(data: DelegateTaskRequest): Promise<void> {
  logApiCall("POST", "/workflow/enhance/task/delegate", data);
  return request.post("/workflow/enhance/task/delegate", data);
}

/**
 * P1-6: 获取流程图数据（实例级别，含运行时状态）
 */
export async function getFlowchartData(
  instanceId: string,
): Promise<FlowchartData> {
  logApiCall("GET", `/workflow/enhance/flowchart/${instanceId}`);
  return request.get(`/workflow/enhance/flowchart/${instanceId}`);
}

/**
 * P1-6: 获取流程图结构（定义级别，仅结构）
 */
export async function getFlowchartStructure(
  definitionId: string,
): Promise<FlowchartStructure> {
  logApiCall("GET", `/workflow/enhance/flowchart/definition/${definitionId}`);
  return request.get(`/workflow/enhance/flowchart/definition/${definitionId}`);
}

/**
 * P1-7: 作废流程
 */
export async function invalidateProcess(
  data: InvalidateProcessRequest,
): Promise<{ deletedTasks: number }> {
  logApiCall("POST", "/workflow/enhance/instance/invalidate", data);
  return request.post("/workflow/enhance/instance/invalidate", data);
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
export async function terminateProcess(
  data: TerminateProcessRequest,
): Promise<{
  instanceId: string;
  deletedTasks: number;
  reason: string;
  message: string;
}> {
  logApiCall("POST", "/workflow/instance/terminate", data);
  return request.post("/workflow/instance/terminate", data);
}

// ==================== 流程导入导出 API ====================

/**
 * 批量导出请求参数
 */
export interface BatchExportRequest {
  workflowIds: string[];
  includeSensitive: boolean;
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  workflowId?: string;
  workflowName: string;
  action: "created" | "updated" | "skipped" | "failed";
  errors?: string[];
  warnings?: string[];
  message?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  workflowName?: string;
  version?: string;
  unsupportedNodeTypes?: string[];
}

/**
 * 导出单个流程
 * @param workflowId 流程 ID
 * @param includeSensitive 是否包含敏感信息
 * @returns 下载文件的 Blob
 */
export async function exportWorkflow(
  workflowId: string,
  includeSensitive: boolean = false,
): Promise<Blob> {
  logApiCall("GET", `/workflow/import-export/export/${workflowId}`, {
    includeSensitive,
  });
  const response = await request.get(
    `/workflow/import-export/export/${workflowId}`,
    {
      params: { includeSensitive },
      responseType: "blob",
    },
  );
  return response;
}

/**
 * 批量导出流程（管理员权限）
 * @param workflowIds 流程 ID 列表
 * @param includeSensitive 是否包含敏感信息
 * @returns 下载文件的 Blob
 */
export async function exportWorkflows(
  workflowIds: string[],
  includeSensitive: boolean = false,
): Promise<Blob> {
  logApiCall("POST", "/workflow/import-export/export/batch", {
    workflowIds,
    includeSensitive,
  });
  const response = await request.post(
    "/workflow/import-export/export/batch",
    {
      workflowIds,
      includeSensitive,
    },
    {
      responseType: "blob",
    },
  );
  return response;
}

/**
 * 验证导入文件
 * @param file 导入文件
 * @returns 验证结果
 */
export async function validateImportFile(
  file: File,
): Promise<ValidationResult> {
  logApiCall("POST", "/workflow/import-export/import/validate", {
    fileName: file.name,
  });
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/workflow/import-export/import/validate", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}

/**
 * 导入流程
 * @param file 导入文件
 * @param conflictStrategy 冲突解决策略（overwrite/rename/skip）
 * @returns 导入结果
 */
export async function importWorkflow(
  file: File,
  conflictStrategy: "overwrite" | "rename" | "skip" = "skip",
): Promise<ImportResult> {
  logApiCall("POST", "/workflow/import-export/import", {
    fileName: file.name,
    conflictStrategy,
  });
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/workflow/import-export/import", formData, {
    params: { conflictStrategy },
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}

/**
 * 批量导入流程（管理员权限）
 * @param files 导入文件列表
 * @param conflictStrategy 冲突解决策略
 * @returns 导入结果列表
 */
export async function importWorkflows(
  files: File[],
  conflictStrategy: "overwrite" | "rename" | "skip" = "skip",
): Promise<ImportResult[]> {
  logApiCall("POST", "/workflow/import-export/import/batch", {
    fileCount: files.length,
    conflictStrategy,
  });
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  return request.post("/workflow/import-export/import/batch", formData, {
    params: { conflictStrategy },
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}

// ==================== 批量操作 API ====================

/**
 * 批量归档请求参数
 */
export interface BatchArchiveRequest {
  workflowIds: string[];
  reason: string;
}

/**
 * 批量操作结果
 */
export interface BatchOperationResult {
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  details: OperationDetail[];
}

/**
 * 操作详情
 */
export interface OperationDetail {
  workflowId: string;
  workflowName: string;
  status: "success" | "failed" | "skipped";
  message?: string;
}

/**
 * 安全检查结果
 */
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

/**
 * 批量归档流程（管理员权限）
 * @param workflowIds 流程 ID 列表
 * @param reason 归档原因
 * @returns 批量操作结果
 */
export async function archiveWorkflows(
  workflowIds: string[],
  reason: string,
): Promise<BatchOperationResult> {
  logApiCall("POST", "/workflow/batch/archive", { workflowIds, reason });
  return request.post("/workflow/batch/archive", {
    workflowIds,
    reason,
  });
}

/**
 * 检查批量操作安全性
 * @param workflowIds 流程 ID 列表
 * @returns 安全检查结果
 */
export async function checkOperationSafety(
  workflowIds: string[],
): Promise<SafetyCheckResult> {
  logApiCall("POST", "/workflow/batch/check-safety", { workflowIds });
  return request.post("/workflow/batch/check-safety", { workflowIds });
}

/**
 * 获取归档流程列表（管理员权限）
 * @param params 查询参数
 * @returns 归档流程列表
 */
export async function getArchivedWorkflows(params?: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  archivedAfter?: string;
  archivedBefore?: string;
}): Promise<any> {
  logApiCall("GET", "/workflow/batch/archived", params);
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  // 归档列表接口使用标准 query 参数，不使用 params[...] 包装
  if (params?.keyword) query.keyword = params.keyword;
  if (params?.archivedAfter) {
    query.archivedAfter = normalizeArchiveDateTime(params.archivedAfter, false);
  }
  if (params?.archivedBefore) {
    query.archivedBefore = normalizeArchiveDateTime(params.archivedBefore, true);
  }
  return request.get("/workflow/batch/archived", { params: query });
}

/**
 * 批量恢复归档流程（管理员权限）
 * @param workflowIds 流程 ID 列表
 * @returns 批量操作结果
 */
export async function restoreWorkflows(
  workflowIds: string[],
): Promise<BatchOperationResult> {
  logApiCall("POST", "/workflow/batch/restore", { workflowIds });
  return request.post("/workflow/batch/restore", { workflowIds });
}

/**
 * 永久删除流程（管理员权限）
 * @param workflowIds 流程 ID 列表
 * @returns 批量操作结果
 */
export async function permanentDeleteWorkflows(
  workflowIds: string[],
): Promise<BatchOperationResult> {
  logApiCall("DELETE", "/workflow/batch/permanent", {
    workflowIds,
    confirmed: true,
  });
  return request.delete("/workflow/batch/permanent", {
    data: { workflowIds, confirmed: true },
  });
}

// ==================== 流程模拟测试 ====================

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

export async function simulateProcess(data: SimulationRequest): Promise<SimulationResult> {
  return request.post('/workflow/simulation/run', data);
}

export async function validateDefinition(definitionId: string): Promise<SimulationResult> {
  return request.post('/workflow/simulation/validate', { definitionId });
}

// ==================== 流程热更新 ====================

export interface HotUpdateRequest {
  processKey: string;
  targetVersion?: number;
  migrationMode: 'COMPATIBLE' | 'FORCE' | 'RESTART';
  instanceIds?: string[];
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

export async function analyzeHotUpdate(data: HotUpdateRequest): Promise<HotUpdateResult> {
  return request.post('/workflow/hot-update/analyze', data);
}

export async function executeHotUpdate(data: HotUpdateRequest): Promise<HotUpdateResult> {
  return request.post('/workflow/hot-update/execute', data);
}

export async function getHotUpdateHistory(processKey: string): Promise<HotUpdateRecord[]> {
  return request.get('/workflow/hot-update/history', { params: { processKey } });
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
  getDoneTasks,
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

  // 流程导入导出
  exportWorkflow,
  exportWorkflows,
  validateImportFile,
  importWorkflow,
  importWorkflows,

  // 批量操作
  archiveWorkflows,
  checkOperationSafety,
  getArchivedWorkflows,
  restoreWorkflows,
  permanentDeleteWorkflows,

  // 流程模拟测试
  simulateProcess,
  validateDefinition,

  // 流程热更新
  analyzeHotUpdate,
  executeHotUpdate,
  getHotUpdateHistory,
};
