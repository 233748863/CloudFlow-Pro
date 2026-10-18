import request from "../request";
import type {
  ProcessDefinitionDetail,
  ProcessDefinitionListItem,
  SaveProcessDefinitionRequest,
  SaveProcessDefinitionResponse,
} from "@/types/workflow";
import { extractList, logApiCall } from "./internals";
import { prepareWorkflowModelForSave } from "@/utils/workflowGraph";
import type { FieldPermission, NodeOption, StartAssigneeNode } from "@/types/workflowSemantic";

export interface StartableProcessDefinition {
  definitionId: string;
  processKey: string;
  processName: string;
  version: number;
  formId?: string;
  category?: string;
  tags?: string;
  description?: string;
  modelValid: boolean;
}

export async function getStartableProcessDefinitions(): Promise<StartableProcessDefinition[]> {
  const definitions: StartableProcessDefinition[] = [];
  let pageNum = 1;
  let total = 0;
  do {
    const page = await request.get<{ rows: StartableProcessDefinition[]; total: number }>(
      "/workflow/wf/startable-definitions", { params: { pageNum, pageSize: 100 } },
    );
    definitions.push(...page.rows);
    total = page.total;
    if (page.rows.length === 0) break;
    pageNum += 1;
  } while ((pageNum - 1) * 100 < total);
  return definitions;
}

/**
 * 获取流程定义列表
 */
export async function getProcessDefinitions(params?: {
  pageNum?: number;
  pageSize?: number;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  latestOnly?: boolean;
}): Promise<ProcessDefinitionListItem[]> {
  const query: Record<string, unknown> = {
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
  return request.get("/workflow/wf/definitions", { params: query }).then(extractList<ProcessDefinitionListItem>);
}

/**
 * 获取流程定义详情
 */
export async function getProcessDefinition(
  definitionId: string,
  context?: { instanceId?: string; taskId?: string },
): Promise<ProcessDefinitionDetail> {
  logApiCall("GET", `/workflow/wf/definition/${definitionId}`);
  return request.get(`/workflow/wf/definition/${definitionId}`, { params: context });
}

/**
 * 保存流程定义
 */
export async function saveProcessDefinition(
  data: SaveProcessDefinitionRequest,
): Promise<SaveProcessDefinitionResponse> {
  logApiCall("POST", "/workflow/wf/definition/save", { processKey: data.processKey });
  return request.post("/workflow/wf/definition/save", { ...data, modelJson: prepareWorkflowModelForSave(data.modelJson) });
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

export const getSelectableNodes = (definitionId: string, currentNodeKey: string) =>
  request.get<NodeOption[]>(`/workflow/wf/definition/${encodeURIComponent(definitionId)}/selectable-nodes`, { params: { currentNodeKey } });

export const getStartAssigneeNodes = (definitionId: string) =>
  request.get<StartAssigneeNode[]>(`/workflow/wf/definition/${encodeURIComponent(definitionId)}/start-assignee-nodes`);

export const getFieldPermissions = (definitionId: string) =>
  request.get<FieldPermission[]>(`/workflow/wf/definition/${encodeURIComponent(definitionId)}/field-permissions`);

export const saveFieldPermissions = (definitionId: string, fields: FieldPermission[]) =>
  request.put<void>(`/workflow/wf/definition/${encodeURIComponent(definitionId)}/field-permissions`, fields);
