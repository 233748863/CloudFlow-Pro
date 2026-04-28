import request from './request';

export interface SysPost {
  postId?: number;
  tenantId?: number;
  postCode: string;
  postName: string;
  postSort: number;
  status: string;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
  remark?: string;
}

export const getPostList = (params?: {
  pageNum?: number;
  pageSize?: number;
  postCode?: string;
  postName?: string;
  status?: string;
}) => request.get('/auth/system/post/list', { params });

export const getPostDetail = (postId: number) => request.get<SysPost>(`/auth/system/post/${postId}`);

export const addPost = (data: SysPost) => request.post('/auth/system/post', data);

export const updatePost = (data: SysPost) => request.put('/auth/system/post', data);

export const deletePost = (postIds: number[]) => request.delete(`/auth/system/post/${postIds.join(',')}`);

export const getPostOptions = () => request.get<SysPost[]>('/auth/system/post/optionselect');

export interface SysConfig {
  configId?: number;
  tenantId?: number;
  configName: string;
  configKey: string;
  configValue: string;
  configType: string;
  configScope: string;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
  remark?: string;
}

export const getConfigList = (params?: {
  pageNum?: number;
  pageSize?: number;
  configName?: string;
  configKey?: string;
  configType?: string;
}) => request.get('/auth/system/config/list', { params });

export const getConfigDetail = (configId: number) => request.get<SysConfig>(`/auth/system/config/${configId}`);

export const getConfigByKey = (configKey: string) => request.get<string>(`/auth/system/config/configKey/${configKey}`);

export const addConfig = (data: SysConfig) => request.post('/auth/system/config', data);

export const updateConfig = (data: SysConfig) => request.put('/auth/system/config', data);

export const deleteConfig = (configIds: number[]) => request.delete(`/auth/system/config/${configIds.join(',')}`);
