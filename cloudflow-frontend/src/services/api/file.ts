import request from './request';
import type { PageQuery } from './auth';

// 所有 /system/** 接口由 cloudflow-auth 服务提供
// 网关路由: /auth/** → cloudflow-auth (StripPrefix=1)

export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/auth/system/file/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

export const getFileList = (params?: PageQuery) => {
  return request.get('/auth/system/file/list', { params });
};

export const deleteFile = (fileIds: number[]) => {
  return request.delete(`/auth/system/file/${fileIds.join(',')}`);
};
