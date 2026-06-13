import request from "../request";
import type { FormDefinitionListItem, SaveFormDefinitionRequest } from "@/types/workflow";
import type { FormDefinition } from "@/types";
import { extractList, extractPageMeta, logApiCall } from "./internals";

/**
 * 获取表单定义列表
 */
export async function getFormDefinitions(): Promise<FormDefinitionListItem[]> {
  const pageSize = 200;
  const allForms: FormDefinitionListItem[] = [];
  let pageNum = 1;

  while (true) {
    logApiCall("GET", "/workflow/wf/forms", { pageNum, pageSize });
    const response = await request.get("/workflow/wf/forms", {
      params: { pageNum, pageSize },
    });
    const records = extractList<FormDefinitionListItem>(response);
    allForms.push(...records);

    const { total } = extractPageMeta(response);
    if (records.length === 0) {
      break;
    }
    if (total !== null && allForms.length >= total) {
      break;
    }
    if (records.length < pageSize) {
      break;
    }

    pageNum += 1;
  }

  return allForms;
}

/**
 * 获取表单定义详情
 */
export async function getFormDefinition(
  formId: string,
): Promise<FormDefinition> {
  logApiCall("GET", `/workflow/wf/form/${formId}`);
  return request.get(`/workflow/wf/form/${formId}`);
}

/**
 * 保存表单定义
 */
export async function saveFormDefinition(
  data: SaveFormDefinitionRequest,
): Promise<FormDefinition> {
  logApiCall("POST", "/workflow/wf/form/save", data);
  return request.post("/workflow/wf/form/save", data);
}
