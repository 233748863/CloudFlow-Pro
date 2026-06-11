import request from '../request'
import { listPage, type ApiRecord, type ListParams } from '../page'

/**
 * CRM 续约管理 API
 * 对标 React: cloudflow-frontend/src/services/api/crm/service.ts
 */

/** 续约列表查询 */
export const listRenewals = (params?: ListParams) => listPage('/crm/renewal/list', params)

/** 新增续约 */
export const addRenewal = (data: ApiRecord) => request.post('/crm/renewal', data)

/** 编辑续约 */
export const editRenewal = (data: ApiRecord) => request.put('/crm/renewal', data)

/** 删除续约 */
export const removeRenewal = (ids: Array<string | number>) =>
  request.delete(`/crm/renewal/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 获取续约详情 */
export const getRenewal = (id: string | number) => request.get(`/crm/renewal/${id}`)

/** 提交续约审批 */
export const submitRenewal = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/renewal/submit/${id}`, data || {})

/** 取消续约 */
export const cancelRenewal = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/renewal/${id}/cancel`, data || {})

/** 续约统计 */
export const getRenewalStatistics = (params?: ApiRecord) =>
  request.get('/crm/renewal/statistics', { params: params || {} })
