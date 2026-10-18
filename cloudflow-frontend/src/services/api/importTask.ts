import request from './request';

export const importServices = ['auth', 'hr', 'oa', 'crm'] as const;
export type ImportService = typeof importServices[number];
export type ImportStatus = 'UPLOADED' | 'VALIDATING' | 'VALIDATED' | 'IMPORTING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
export interface ImportBusiness {
  service: ImportService;
  bizType: string;
  bizName: string;
  maxRows: number;
  maxFileSize: number;
  supportsUpdates?: boolean;
  canDownloadUpdateTemplate?: boolean;
  instructions?: string[];
  columns: Array<{ field: string; name: string; required: boolean }>;
}
export interface ImportTask {
  taskId: number;
  taskNo: string;
  bizType: string;
  bizName: string;
  fileName: string;
  fileSize: number;
  fileUrl: string | null;
  errorFileUrl: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  successRows: number;
  failRows: number;
  status: ImportStatus;
  operatorName: string;
  createTime: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  errorMessage?: string;
  jobLogId?: number;
}
export interface ImportPage<Row> { rows: Row[]; total: number; pageNum: number; pageSize: number }
export interface ImportPreview {
  task: ImportTask;
  rows: Array<{ rowNo: number; values: Record<string, string | null> }>;
  errorCounts: Record<string, number>;
  errors: ImportPage<{ errorId: number; rowNo: number; columnName?: string; cellValue?: string; errorType: string; errorMessage: string }>;
}
export const importServiceNames: Record<ImportService, string> = { auth: '系统', hr: '人力资源', oa: '行政办公', crm: '客户管理' };
export const importStatusNames: Record<ImportStatus, string> = {
  UPLOADED: '待校验', VALIDATING: '校验中', VALIDATED: '待导入', IMPORTING: '导入中',
  SUCCESS: '全部成功', PARTIAL: '部分成功', FAILED: '失败', CANCELLED: '已取消',
};
export const isImportRunning = (task: ImportTask) => task.status === 'VALIDATING' || task.status === 'IMPORTING';
const base = (service: ImportService) => `/${service}/system/import`;

export async function loadImportBusinesses(signal?: AbortSignal) {
  const results = await Promise.allSettled(importServices.map(async (service) => {
    const businesses = await request.get<Omit<ImportBusiness, 'service'>[]>(`${base(service)}/types`, { signal, silent: true });
    return businesses.map((business) => ({ ...business, service }));
  }));
  const businesses: ImportBusiness[] = [];
  const unavailable: ImportService[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') businesses.push(...result.value);
    else unavailable.push(importServices[index]);
  });
  return { businesses, unavailable };
}

export const listImportTasks = (service: ImportService, query: { bizType?: string; status?: string; pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<ImportPage<ImportTask>>(`${base(service)}/list`, { params: query, signal, silent: true });
export const getImportTask = (service: ImportService, taskId: number, signal?: AbortSignal) =>
  request.get<ImportTask>(`${base(service)}/${taskId}`, { signal, silent: true });
export const previewImportTask = (service: ImportService, taskId: number, pageNum = 1, signal?: AbortSignal) =>
  request.get<ImportPreview>(`${base(service)}/${taskId}/preview`, { params: { pageNum, pageSize: 20 }, signal, silent: true, timeout: 120000 });
export const downloadImportTemplate = (business: ImportBusiness, options?: { updates: boolean; keyword?: string }) =>
  request.get<Blob>(`${base(business.service)}/${encodeURIComponent(business.bizType)}/template`,
    { params: options, responseType: 'blob', silent: true, timeout: 120000 });
export const downloadImportFile = (service: ImportService, taskId: number, errors = false) =>
  request.get<Blob>(`${base(service)}/${taskId}/${errors ? 'errors/file' : 'file'}`, { responseType: 'blob', silent: true, timeout: 120000 });
export const uploadImportFile = (business: ImportBusiness, file: File) => {
  const data = new FormData();
  data.append('file', file);
  return request.post<ImportTask>(`${base(business.service)}/${encodeURIComponent(business.bizType)}/upload`, data,
    { headers: { 'Content-Type': undefined }, silent: true, timeout: 120000 });
};
export const validateImportTask = (service: ImportService, taskId: number) =>
  request.post<ImportTask>(`${base(service)}/${taskId}/validate`, undefined, { silent: true, timeout: 120000 });
export const executeImportTask = (service: ImportService, taskId: number, skipInvalidRows: boolean) =>
  request.post<ImportTask>(`${base(service)}/${taskId}/execute`, { skipInvalidRows }, { silent: true, timeout: 120000 });
export const cancelImportTask = (service: ImportService, taskId: number) =>
  request.post<ImportTask>(`${base(service)}/${taskId}/cancel`, undefined, { silent: true });
