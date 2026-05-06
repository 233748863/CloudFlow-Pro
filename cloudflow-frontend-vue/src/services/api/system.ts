import request from '@/services/api/request'
import type { PageResult } from '@/types'

export interface SysPost {
  postId?: number
  tenantId?: number
  postCode: string
  postName: string
  postSort: number
  status: string
  createBy?: string
  createTime?: string
  updateBy?: string
  updateTime?: string
  remark?: string
}

export interface SysPostQuery {
  pageNum?: number
  pageSize?: number
  postCode?: string
  postName?: string
  status?: string
}

export interface SysConfig {
  configId?: number
  tenantId?: number
  configName: string
  configKey: string
  configValue: string
  configType: string
  configScope: string
  createBy?: string
  createTime?: string
  updateBy?: string
  updateTime?: string
  remark?: string
}

export interface SysConfigQuery {
  pageNum?: number
  pageSize?: number
  configName?: string
  configKey?: string
  configType?: string
}

export interface CacheCommandStat {
  name: string
  value: number | string
}

export interface CacheKeyGroup {
  prefix: string
  count: number
}

export interface CacheInfo {
  info: Record<string, string>
  dbSize: number
  commandStats: CacheCommandStat[]
  keyGroups: CacheKeyGroup[]
}

export interface CacheKeyDetail {
  key: string
  type: string
  ttl: number
  value: unknown
  size?: number
}

export const getPostList = (params?: SysPostQuery) =>
  request.get<PageResult<SysPost>>('/auth/system/post/list', { params })

export const getPostDetail = (postId: number) =>
  request.get<SysPost>(`/auth/system/post/${postId}`)

export const addPost = (data: SysPost) =>
  request.post<void>('/auth/system/post', data)

export const updatePost = (data: SysPost) =>
  request.put<void>('/auth/system/post', data)

export const deletePost = (postIds: number[]) =>
  request.delete<void>(`/auth/system/post/${postIds.join(',')}`)

export const getPostOptions = () =>
  request.get<SysPost[]>('/auth/system/post/optionselect')

export const getConfigList = (params?: SysConfigQuery) =>
  request.get<PageResult<SysConfig>>('/auth/system/config/list', { params })

export const getConfigDetail = (configId: number) =>
  request.get<SysConfig>(`/auth/system/config/${configId}`)

export const getConfigByKey = (configKey: string) =>
  request.get<string>(`/auth/system/config/configKey/${configKey}`)

export const addConfig = (data: SysConfig) =>
  request.post<void>('/auth/system/config', data)

export const updateConfig = (data: SysConfig) =>
  request.put<void>('/auth/system/config', data)

export const deleteConfig = (configIds: number[]) =>
  request.delete<void>(`/auth/system/config/${configIds.join(',')}`)

export const getCacheInfo = () =>
  request.get<CacheInfo>('/auth/system/cache/info')

export const getCacheKeys = (pattern?: string) =>
  request.get<string[]>('/auth/system/cache/keys', { params: { pattern: pattern || '*' } })

export const getCacheKeyValue = (key: string) =>
  request.get<CacheKeyDetail>('/auth/system/cache/value', { params: { key } })

export const deleteCacheKey = (key: string) =>
  request.delete<boolean>('/auth/system/cache/key', { params: { key } })

export const deleteCacheByPrefix = (prefix: string) =>
  request.delete<number>('/auth/system/cache/prefix', { params: { prefix } })
