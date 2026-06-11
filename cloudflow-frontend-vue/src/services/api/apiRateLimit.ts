import { createRecord, deleteRecords, listPage, runRecordAction, updateRecord, type ApiRecord, type ListParams } from './page'

export const listApiRateLimitRules = (params?: ListParams) => listPage('/auth/system/api-ratelimit/page', params)
export const createApiRateLimitRule = (data: ApiRecord) => createRecord('/auth/system/api-ratelimit', data)
export const updateApiRateLimitRule = (data: ApiRecord) => updateRecord('/auth/system/api-ratelimit', data)
export const deleteApiRateLimitRule = (id: string | number) => deleteRecords('/auth/system/api-ratelimit', [id], 'single')
export const setApiRateLimitStatus = (id: string | number, status: 'ACTIVE' | 'INACTIVE') =>
  runRecordAction(`/auth/system/api-ratelimit/${id}/status?status=${status}`)
