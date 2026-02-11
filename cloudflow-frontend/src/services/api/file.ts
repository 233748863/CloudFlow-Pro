import request from './request';

// All /system/** endpoints are served by cloudflow-auth service.
// Gateway route: /auth/** → cloudflow-auth (StripPrefix=1)

export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/auth/system/file/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

export const getFileList = (params?: any) => {
  return request.get('/auth/system/file/list', { params });
};

export const deleteFile = (fileIds: number[]) => {
  return request.delete(`/auth/system/file/${fileIds.join(',')}`);
};
