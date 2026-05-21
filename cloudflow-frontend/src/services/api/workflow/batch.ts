import request from "../request";
import { logApiCall, normalizeArchiveDateTime } from "./internals";
import type { BatchOperationResult, SafetyCheckResult } from "./types";

/**
 * 批量归档流程（管理员权限）
 */
export async function archiveWorkflows(
  workflowIds: string[],
  reason: string,
): Promise<BatchOperationResult> {
  logApiCall("POST", "/workflow/batch/archive", { workflowIds, reason });
  return request.post("/workflow/batch/archive", { workflowIds, reason });
}

/**
 * 检查批量操作安全性
 */
export async function checkOperationSafety(
  workflowIds: string[],
): Promise<SafetyCheckResult> {
  logApiCall("POST", "/workflow/batch/check-safety", { workflowIds });
  return request.post("/workflow/batch/check-safety", { workflowIds });
}

/**
 * 获取归档流程列表（管理员权限）
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
 */
export async function restoreWorkflows(
  workflowIds: string[],
): Promise<BatchOperationResult> {
  logApiCall("POST", "/workflow/batch/restore", { workflowIds });
  return request.post("/workflow/batch/restore", { workflowIds });
}

/**
 * 永久删除流程（管理员权限）
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
