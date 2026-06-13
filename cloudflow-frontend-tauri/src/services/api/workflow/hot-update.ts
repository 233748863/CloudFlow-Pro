import request from "../request";
import type {
  HotUpdateRecord,
  HotUpdateRequest,
  HotUpdateResult,
} from "./types";

/**
 * 热更新影响分析
 */
export async function analyzeHotUpdate(
  data: HotUpdateRequest,
): Promise<HotUpdateResult> {
  return request.post("/workflow/hot-update/analyze", data);
}

/**
 * 热更新预备阶段（生成 confirmToken）
 */
export async function prepareHotUpdate(
  data: HotUpdateRequest,
): Promise<HotUpdateResult> {
  return request.post("/workflow/hot-update/prepare", data);
}

/**
 * 热更新执行
 */
export async function executeHotUpdate(
  data: HotUpdateRequest,
): Promise<HotUpdateResult> {
  return request.post("/workflow/hot-update/execute", data);
}

/**
 * 获取热更新历史
 */
export async function getHotUpdateHistory(
  processKey: string,
): Promise<HotUpdateRecord[]> {
  return request.get("/workflow/hot-update/history", {
    params: { processKey },
  });
}
