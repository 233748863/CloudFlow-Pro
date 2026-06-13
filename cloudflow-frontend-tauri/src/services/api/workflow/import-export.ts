import request from "../request";
import { logApiCall } from "./internals";
import type { ImportResult, ValidationResult } from "./types";

/**
 * 导出单个流程
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
    { workflowIds, includeSensitive },
    { responseType: "blob" },
  );
  return response;
}

/**
 * 验证导入文件
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
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/**
 * 导入流程
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
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/**
 * 批量导入流程（管理员权限）
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
    headers: { "Content-Type": "multipart/form-data" },
  });
}
