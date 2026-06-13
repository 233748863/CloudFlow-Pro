import request from './request';
import type { PageQuery } from './auth';
import type { TenantStorageSummary } from './tenant';

export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/auth/system/file/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const getFileList = (params?: PageQuery) => {
  return request.get('/auth/system/file/list', { params });
};

export const getFileStorageSummary = () => {
  return request.get('/auth/system/file/storage/summary') as Promise<TenantStorageSummary>;
};

export const refreshFileStorageSummary = () => {
  return request.post('/auth/system/file/storage/refresh') as Promise<TenantStorageSummary>;
};

export const deleteFile = (fileIds: number[]) => {
  return request.delete(`/auth/system/file/${fileIds.join(',')}`);
};