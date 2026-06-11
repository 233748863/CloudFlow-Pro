import request from './request'
import { createRecord, deleteRecords, listPage, runRecordAction, updateRecord, type ApiRecord, type ListParams } from './page'

/** 业务规则管理 */
export const listBusinessRules = (params?: ListParams) => listPage('/auth/system/rules/list', params)
export const createBusinessRule = (data: ApiRecord) => createRecord('/auth/system/rules', data)
export const updateBusinessRule = (data: ApiRecord) => updateRecord('/auth/system/rules', data)
export const deleteBusinessRules = (ids: Array<string | number>) => deleteRecords('/auth/system/rules', ids)

/** 业务规则详情 */
export const getBusinessRule = (id: string | number) => request.get(`/auth/system/rules/${id}`)

/** 获取当前生效规则 */
export const getEffectiveBusinessRule = (ruleCode: string) =>
  request.get(`/auth/system/rules/effective/${ruleCode}`)

/** 创建规则草稿 */
export const createBusinessRuleDraft = (data: ApiRecord) =>
  request.post('/auth/system/rules/draft', data)

/** 启用/停用规则 */
export const setBusinessRuleEnabled = (id: string | number, enabled: number) =>
  runRecordAction(`/auth/system/rules/${id}/enabled?enabled=${enabled}`, 'put')

/** 业务规则版本管理 */
export const listBusinessRuleVersions = (params?: ListParams) =>
  listPage('/auth/system/rules/versions/list', params)

/** 发布规则版本 */
export const publishBusinessRuleVersion = (versionId: string | number, data?: ApiRecord) =>
  request.post(`/auth/system/rules/version/${versionId}/publish`, data || {})

/** 回滚到指定版本 */
export const rollbackBusinessRuleVersion = (ruleId: string | number, versionId: string | number, data?: ApiRecord) =>
  request.post(`/auth/system/rules/${ruleId}/rollback/${versionId}`, data || {})

/** 业务规则命中记录查询 */
export const listBusinessRuleHitRecords = (params?: ListParams) =>
  listPage('/auth/system/rules/hit-records/list', params)
