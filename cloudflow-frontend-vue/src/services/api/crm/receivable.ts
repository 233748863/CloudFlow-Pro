import request from '../request'
import { listPage, type ApiRecord, type ListParams } from '../page'

/**
 * CRM 应收管理 API
 * 对标 React: cloudflow-frontend/src/services/api/crm/service.ts
 */

/** 应收列表查询 */
export const listReceivables = (params?: ListParams) => listPage('/crm/receivable/list', params)

/** 新增应收 */
export const addReceivable = (data: ApiRecord) => request.post('/crm/receivable', data)

/** 编辑应收 */
export const editReceivable = (data: ApiRecord) => request.put('/crm/receivable', data)

/** 删除应收 */
export const removeReceivable = (ids: Array<string | number>) =>
  request.delete(`/crm/receivable/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 获取应收详情 */
export const getReceivable = (id: string | number) => request.get(`/crm/receivable/${id}`)

/** 确认应收 */
export const confirmReceivable = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/receivable/${id}/confirm`, data || {})

/** 应收绑定发票 */
export const bindReceivableInvoice = (receivableId: string | number, invoiceId: string | number, data?: ApiRecord) =>
  request.post(`/crm/receivable/${receivableId}/bind-invoice`, { invoiceId, ...(data || {}) })

/** 应收账龄分析 */
export const getReceivableAging = (params?: ApiRecord) =>
  request.get('/crm/receivable/aging', { params: params || {} })

/** 获取应收核销记录 */
export const getReceivableWriteoffs = (receivableId: string | number) =>
  request.get(`/crm/receivable/${receivableId}/writeoffs`)

/** 应收核销 */
export const writeoffReceivable = (receivableId: string | number, data: ApiRecord) =>
  request.post(`/crm/receivable/${receivableId}/writeoff`, data)
