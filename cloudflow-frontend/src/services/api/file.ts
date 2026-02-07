import request from './request';

export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/system/file/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

export const getFileList = (params?: any) => {
  return request.get('/system/file/list', { params });
};

export const deleteFile = (fileIds: number[]) => {
  return request.delete(`/system/file/${fileIds.join(',')}`);
};
