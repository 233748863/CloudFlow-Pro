import request from "../request";
import type { CompleteTaskRequest, PageResult, TasksCount, UrgeTaskRequest } from "@/types/workflow";
import type { Task } from "@/types";
import { logApiCall } from "./internals";
import type {
  AddSignRequest,
  DelegateTaskRequest,
  RejectTaskRequest,
  RemoveSignRequest,
  SignatureChangeRequest,
} from "./types";

/**
 * 获取待办任务列表（支持分页和条件查询）
 * 注意：userId 参数被后端忽略（使用上下文中的当前用户）
 */
export async function getTodoTasks(params?: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  processDefKey?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  startUserName?: string;
}): Promise<PageResult<Task>> {
  logApiCall("GET", "/workflow/wf/todo", params);
  const query: Record<string, unknown> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 999,
  };
  if (params?.keyword) query["params[keyword]"] = params.keyword;
  if (params?.processDefKey) query["params[processDefKey]"] = params.processDefKey;
  if (params?.startTimeFrom) query["params[startTimeFrom]"] = params.startTimeFrom;
  if (params?.startTimeTo) query["params[startTimeTo]"] = params.startTimeTo;
  if (params?.startUserName) query["params[startUserName]"] = params.startUserName;
  return request.get("/workflow/wf/todo", { params: query });
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
}): Promise<PageResult<Task>> {
  logApiCall("GET", "/workflow/wf/done", params);
  const query: Record<string, unknown> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  if (params?.keyword) query["params[keyword]"] = params.keyword;
  if (params?.processDefKey) query["params[processDefKey]"] = params.processDefKey;
  if (params?.startTimeFrom) query["params[startTimeFrom]"] = params.startTimeFrom;
  if (params?.startTimeTo) query["params[startTimeTo]"] = params.startTimeTo;
  if (params?.startUserName) query["params[startUserName]"] = params.startUserName;
  return request.get("/workflow/wf/done", { params: query });
}

/**
 * 完成任务（审批/拒绝/转办等）
 */
export async function completeTask(data: CompleteTaskRequest): Promise<void> {
  logApiCall("POST", "/workflow/wf/complete", data);
  return request.post("/workflow/wf/complete", data);
}

/**
 * 标记任务为已读
 */
export async function readTask(taskId: string): Promise<void> {
  logApiCall("POST", `/workflow/wf/task/read/${taskId}`);
  return request.post(`/workflow/wf/task/read/${taskId}`);
}

/**
 * 催办任务
 */
export async function urgeTask(taskId: string, reason: string): Promise<void> {
  logApiCall("POST", "/workflow/wf/task/urge", { taskId, reason });
  const data: UrgeTaskRequest = { taskId, reason };
  return request.post("/workflow/wf/task/urge", data);
}

/**
 * 驳回任务到指定节点
 */
export async function rejectTask(
  taskId: string,
  targetNodeKey: string,
  comment: string,
): Promise<void> {
  logApiCall("POST", "/workflow/wf/reject", { taskId, targetNodeKey, comment });
  const data: RejectTaskRequest = { taskId, targetNodeKey, comment };
  return request.post("/workflow/wf/reject", data);
}

/**
 * 获取任务统计
 */
export async function getTasksCount(): Promise<TasksCount> {
  logApiCall("GET", "/workflow/wf/tasks/count");
  return request.get("/workflow/wf/tasks/count");
}

/**
 * 获取任务统计详情
 * 包括按时间段、状态、流程类型、处理人的统计，以及平均处理时长和完成率
 */
export async function getTaskStatistics(params?: {
  userId?: number;
  startTime?: string;
  endTime?: string;
}): Promise<Record<string, unknown>> {
  logApiCall("GET", "/workflow/wf/tasks/statistics", params);
  return request.get("/workflow/wf/tasks/statistics", { params });
}

/**
 * 获取任务分组信息
 * 按流程类型、状态、优先级、处理人等维度分组
 */
export async function getTaskGroups(
  userId?: number,
): Promise<Record<string, unknown>> {
  logApiCall("GET", "/workflow/wf/tasks/groups", { userId });
  return request.get("/workflow/wf/tasks/groups", { params: { userId } });
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
  logApiCall("POST", "/workflow/wf/task/add-signature", { taskId, userIds, comment });
  const data: SignatureChangeRequest = { taskId, userIds, comment };
  return request.post("/workflow/wf/task/add-signature", data);
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
  logApiCall("POST", "/workflow/wf/task/reduction-signature", { taskId, userIds, comment });
  const data: SignatureChangeRequest = { taskId, userIds, comment };
  return request.post("/workflow/wf/task/reduction-signature", data);
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
