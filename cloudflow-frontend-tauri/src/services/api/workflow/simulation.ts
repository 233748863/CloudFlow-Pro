import request from "../request";
import type { SimulationRequest, SimulationResult } from "./types";

/**
 * 流程模拟运行
 */
export async function simulateProcess(
  data: SimulationRequest,
): Promise<SimulationResult> {
  return request.post("/workflow/simulation/run", data);
}

/**
 * 校验流程定义
 */
export async function validateDefinition(
  definitionId: string,
): Promise<SimulationResult> {
  return request.post("/workflow/simulation/validate", { definitionId });
}
