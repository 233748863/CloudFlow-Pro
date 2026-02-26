import request from './request';

// ================= 岗位管理 =================

/** 岗位信息 */
export interface SysPost {
  postId?: number;
  tenantId?: number;
  postCode: string;
  postName: string;
  postSort: number;
  status: string; // 0: 正常, 1: 停用
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
  remark?: string;
}

/** 分页查询岗位列表 */
export const getPostList = (params?: {
  pageNum?: number;
  pageSize?: number;
  postCode?: string;
  postName?: string;
  status?: string;
}) => {
  return request.get('/auth/system/post/list', { params });
};

/** 获取岗位详情 */
export const getPostDetail = (postId: number) => {
  return request.get<SysPost>(`/auth/system/post/${postId}`);
};

/** 新增岗位 */
export const addPost = (data: SysPost) => {
  return request.post('/auth/system/post', data);
};

/** 修改岗位 */
export const updatePost = (data: SysPost) => {
  return request.put('/auth/system/post', data);
};

/** 删除岗位（支持批量） */
export const deletePost = (postIds: number[]) => {
  return request.delete(`/auth/system/post/${postIds.join(',')}`);
};

/** 获取岗位下拉选项（仅正常状态） */
export const getPostOptions = () => {
  return request.get<SysPost[]>('/auth/system/post/optionselect');
};

// ================= 参数配置 =================

/** 系统参数配置 */
export interface SysConfig {
  configId?: number;
  tenantId?: number;
  configName: string;
  configKey: string;
  configValue: string;
  configType: string; // Y: 系统内置, N: 非内置
  configScope: string; // 0: 全局配置, 1: 租户配置
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
  remark?: string;
}

/** 分页查询参数配置列表 */
export const getConfigList = (params?: {
  pageNum?: number;
  pageSize?: number;
  configName?: string;
  configKey?: string;
  configType?: string;
}) => {
  return request.get('/auth/system/config/list', { params });
};

/** 获取参数配置详情 */
export const getConfigDetail = (configId: number) => {
  return request.get<SysConfig>(`/auth/system/config/${configId}`);
};

/** 根据参数键名查询参数值 */
export const getConfigByKey = (configKey: string) => {
  return request.get<string>(`/auth/system/config/configKey/${configKey}`);
};

/** 新增参数配置 */
export const addConfig = (data: SysConfig) => {
  return request.post('/auth/system/config', data);
};

/** 修改参数配置 */
export const updateConfig = (data: SysConfig) => {
  return request.put('/auth/system/config', data);
};

/** 删除参数配置（支持批量） */
export const deleteConfig = (configIds: number[]) => {
  return request.delete(`/auth/system/config/${configIds.join(',')}`);
};

// ================= 缓存监控 =================

/** Redis 服务器信息 */
export interface CacheInfo {
  info: Record<string, string>;
  dbSize: number;
  commandStats: { name: string; value: number }[];
  keyGroups: { prefix: string; count: number }[];
}

/** 获取缓存监控信息 */
export const getCacheInfo = () => {
  return request.get<CacheInfo>('/auth/system/cache/info');
};

/** 获取缓存 Key 列表（支持模式匹配） */
export const getCacheKeys = (pattern?: string) => {
  return request.get<string[]>('/auth/system/cache/keys', { params: { pattern: pattern || '*' } });
};

/** 缓存 Key 详情 */
export interface CacheKeyDetail {
  key: string;
  type: string;
  ttl: number;
  value: any;
  size?: number;
}

/** 获取指定 Key 的详细信息（值、类型、TTL） */
export const getCacheKeyValue = (key: string) => {
  return request.get<CacheKeyDetail>('/auth/system/cache/value', { params: { key } });
};

/** 删除指定的 Key */
export const deleteCacheKey = (key: string) => {
  return request.delete<boolean>('/auth/system/cache/key', { params: { key } });
};

/** 按前缀批量删除 Key */
export const deleteCacheByPrefix = (prefix: string) => {
  return request.delete<number>('/auth/system/cache/prefix', { params: { prefix } });
};
