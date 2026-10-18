import request from './request';

export interface PrintTemplate {
  templateId?: number;
  templateCode: string;
  templateName: string;
  bizType: string;
  templateFormat: 'HTML' | 'EXCEL';
  outputFormat: 'HTML' | 'PDF' | 'EXCEL';
  templateContent?: string | null;
  templateFileUrl?: string | null;
  paperSize: 'A4' | 'A5' | 'LETTER' | 'CUSTOM';
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  paperWidthMm?: number | null;
  paperHeightMm?: number | null;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  variablesDeclare?: string | null;
  defaultFlag: number;
  version?: number;
  status: 'ENABLED' | 'DISABLED';
  remark?: string | null;
}
export interface PrintTemplateQuery {
  pageNum: number;
  pageSize: number;
  templateCode?: string;
  bizType?: string;
  status?: string;
}
const base = '/auth/system/print/template';
export const listPrintTemplates = (params: PrintTemplateQuery) =>
  request.get<{ rows: PrintTemplate[]; total: number }>(base + '/list', { params });
export const getPrintTemplate = (id: number) => request.get<PrintTemplate>(base + '/' + id);
export const savePrintTemplate = (template: PrintTemplate, file: File | null) => {
  const body = new FormData();
  body.append('template', new Blob([JSON.stringify(template)], { type: 'application/json' }));
  if (file) body.append('file', file);
  const config = { headers: { 'Content-Type': 'multipart/form-data' } };
  return template.templateId ? request.put<PrintTemplate>(base, body, config) : request.post<PrintTemplate>(base, body, config);
};
export const removePrintTemplate = (id: number, version: number) => request.delete<void>(base + '/' + id, { params: { version } });
export const downloadPrintTemplate = (id: number) => request.get<Blob>(base + '/' + id + '/file', { responseType: 'blob' });

export type PrintFormat = PrintTemplate['outputFormat'];
export interface PrintTemplateOption { templateCode: string; templateName: string; templateFormat: 'HTML' | 'EXCEL'; outputFormat: PrintFormat; defaultFlag: number }
const businessPath = (bizType: string, bizId: number) => '/auth/system/print/' + encodeURIComponent(bizType) + '/' + bizId;
export const listBusinessPrintTemplates = (bizType: string, bizId: number, signal?: AbortSignal) =>
  request.get<PrintTemplateOption[]>(businessPath(bizType, bizId) + '/templates', { signal });
export const printBusinessDocument = (bizType: string, bizId: number, templateCode: string, outputFormat: PrintFormat, signal?: AbortSignal) =>
  request.post<Blob>(businessPath(bizType, bizId), null, { params: { templateCode, outputFormat }, responseType: 'blob', signal });
export const previewPrintTemplate = (id: number, sample: Record<string, unknown>, outputFormat: PrintFormat, signal?: AbortSignal) =>
  request.post<Blob>(base + '/' + id + '/preview', sample, { params: { outputFormat }, responseType: 'blob', signal });
export interface PrintRecord { recordId: number; templateCode: string; bizType: string; bizId: string; outputFormat: PrintFormat; operatorId: number; operatorName: string; printTime: string; ipAddress?: string; fileSize: number }
export interface PrintRecordQuery { pageNum: number; pageSize: number; bizType?: string; bizId?: string; operatorId?: string }
export const listPrintRecords = (params: PrintRecordQuery) => request.get<{ rows: PrintRecord[]; total: number }>('/auth/system/print/record/list', { params });
