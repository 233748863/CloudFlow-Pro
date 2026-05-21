import request from "../request";
import type { ProcessInstance, ProcessTrace, StartProcessRequest } from "@/types/workflow";
import { logApiCall } from "./internals";
import type { InstanceIdRequest, InvalidateProcessRequest, TerminateProcessRequest } from "./types";

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
  logApiCall("POST", "/workflow/wf/start", payload);
  return request.post("/workflow/wf/start", payload);
}

/**
 * 获取流程实例详情
 */
export async function getProcessInstance(
  instanceId: string,
): Promise<ProcessInstance> {
  logApiCall("GET", `/workflow/wf/instance/${instanceId}`);
  return request.get(`/workflow/wf/instance/${instanceId}`);
}

/**
 * 获取流程轨迹
 */
export async function getProcessTrace(
  instanceId: string,
): Promise<ProcessTrace> {
  logApiCall("GET", `/workflow/wf/instance/${instanceId}/trace`);
  return request.get(`/workflow/wf/instance/${instanceId}/trace`);
}

/**
 * 获取我的申请列表（支持分页和条件查询）
 */
export async function getMyInstances(params?: {
  pageNum?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  processDefKey?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  priority?: string;
  processNo?: string;
  startUserName?: string;
}): Promise<any> {
  logApiCall("GET", "/workflow/wf/my-instances", params);
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  if (params?.status) query["params[status]"] = params.status;
  if (params?.keyword) query["params[keyword]"] = params.keyword;
  if (params?.processDefKey) query["params[processDefKey]"] = params.processDefKey;
  if (params?.startTimeFrom) query["params[startTimeFrom]"] = params.startTimeFrom;
  if (params?.startTimeTo) query["params[startTimeTo]"] = params.startTimeTo;
  if (params?.priority) query["params[priority]"] = params.priority;
  if (params?.processNo) query["params[processNo]"] = params.processNo;
  if (params?.startUserName) query["params[startUserName]"] = params.startUserName;
  return request.get("/workflow/wf/my-instances", { params: query });
}

/**
 * 撤回流程
 */
export async function recallProcess(instanceId: string): Promise<void> {
  logApiCall("POST", "/workflow/wf/recall", { instanceId });
  const data: InstanceIdRequest = { instanceId };
  return request.post("/workflow/wf/recall", data);
}

/**
 * 暂停流程
 */
export async function pauseProcess(instanceId: string): Promise<void> {
  logApiCall("POST", "/workflow/wf/pause", { instanceId });
  const data: InstanceIdRequest = { instanceId };
  return request.post("/workflow/wf/pause", data);
}

/**
 * 恢复流程
 */
export async function resumeProcess(instanceId: string): Promise<void> {
  logApiCall("POST", "/workflow/wf/resume", { instanceId });
  const data: InstanceIdRequest = { instanceId };
  return request.post("/workflow/wf/resume", data);
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
  logApiCall("POST", "/workflow/wf/instance/terminate", data);
  return request.post("/workflow/wf/instance/terminate", data);
}
