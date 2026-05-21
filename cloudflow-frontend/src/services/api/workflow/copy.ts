import request from "../request";
import { logApiCall } from "./internals";
import type { BatchCopyReadRequest } from "./types";

/**
 * 获取"抄送我的"列表（分页）
 */
export async function getMyCopyList(params?: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  isRead?: number;
  processDefKey?: string;
}): Promise<any> {
  logApiCall("GET", "/workflow/copy/list", params);
  const query: Record<string, any> = {
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  };
  if (params?.keyword) query["params[keyword]"] = params.keyword;
  if (params?.isRead !== undefined) query["params[isRead]"] = params.isRead;
  if (params?.processDefKey) query["params[processDefKey]"] = params.processDefKey;
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
