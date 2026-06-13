import request from "../request";
import { logApiCall } from "./internals";
import type { FlowchartData, FlowchartStructure } from "./types";

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
