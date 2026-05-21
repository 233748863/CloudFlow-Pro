import request from "../request";
import type {
  ProcessDefinitionDetail,
  ProcessDefinitionListItem,
  SaveProcessDefinitionRequest,
  SaveProcessDefinitionResponse,
} from "@/types/workflow";
import { extractList, logApiCall } from "./internals";

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

  logApiCall("GET", "/workflow/wf/definitions", query);
  return request.get("/workflow/wf/definitions", { params: query }).then(extractList);
}

/**
 * 获取流程定义详情
 */
export async function getProcessDefinition(
  definitionId: string,
): Promise<ProcessDefinitionDetail> {
  logApiCall("GET", `/workflow/wf/definition/${definitionId}`);
  return request.get(`/workflow/wf/definition/${definitionId}`);
}

/**
 * 保存流程定义
 */
export async function saveProcessDefinition(
  data: SaveProcessDefinitionRequest,
): Promise<SaveProcessDefinitionResponse> {
  logApiCall("POST", "/workflow/wf/definition/save", data);
  return request.post("/workflow/wf/definition/save", data);
}

/**
 * 发布流程定义
 */
export async function deployProcessDefinition(
  definitionId: string,
): Promise<void> {
  logApiCall("POST", `/workflow/wf/definition/deploy/${definitionId}`);
  return request.post(`/workflow/wf/definition/deploy/${definitionId}`);
}

/**
 * 删除流程定义
 */
export async function deleteProcessDefinition(
  definitionId: string,
): Promise<void> {
  logApiCall("DELETE", `/workflow/wf/definition/${definitionId}`);
  return request.delete(`/workflow/wf/definition/${definitionId}`);
}
