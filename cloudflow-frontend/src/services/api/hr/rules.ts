import request from '@/services/api/request';
import { downloadBlob } from '@/utils/download';
import type { HrRecord } from './types';
import { hrFileDownloadContext, readHrAuthorizedFile } from './fileDownload';
import type { FileDownloadRequest } from '../file';

export interface RuleTaskResult {
  executeStatus: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'TIMEOUT';
  affectedRows?: number;
  resultMsg?: string;
}

export const ruleGet = <Result = HrRecord[]>(path: string, params?: Record<string, unknown>) =>
  request.get<Result>(`/hr${path}`, { params });

export const rulePost = <Result = number>(path: string, data?: unknown, params?: Record<string, unknown>) =>
  request.post<Result>(`/hr${path}`, data, { params });

export const rulePut = <Result = void>(path: string, data: unknown) => request.put<Result>(`/hr${path}`, data);

export const ruleUpload = async (path: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return request.post<{ fileId: number; fileName: string; reference?: string }>(`/hr${path}`, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const ruleDownload = async (path: string, filename: string, authorizedContext?: FileDownloadRequest) => {
  const context = authorizedContext ?? hrFileDownloadContext(path);
  const blob = context ? await readHrAuthorizedFile(context) : await request.get<Blob>(`/hr${path}`, { responseType: 'blob' });
  downloadBlob(blob, filename);
};
