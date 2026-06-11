import request from '@/services/api/request'
import { createCrmRecord, deleteCrmRecords, listCrmPage, updateCrmRecord } from './service'
import type { CrmListParams, CrmRecord } from './types'
import type { ApiRecord } from '../page'

/** 商机管理 */
export const listOpportunities = (params?: CrmListParams) => listCrmPage('opportunity', params)
export const addOpportunity = (data: CrmRecord) => createCrmRecord('opportunity', data)
export const editOpportunity = (data: CrmRecord) => updateCrmRecord('opportunity', data)
export const removeOpportunity = (ids: Array<string | number>) => deleteCrmRecords('opportunity', ids)

/** 商机详情 */
export const getOpportunity = (id: string | number) => request.get(`/crm/opportunity/${id}`)

/** 商机赢单 */
export const winOpportunity = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/opportunity/${id}/win`, data || {})

/** 商机输单 */
export const loseOpportunity = (id: string | number, lostReason = '') =>
  request.post(`/crm/opportunity/${id}/lose`, { lostReason })

/** 商机阶段变更 */
export const updateOpportunityStage = (data: { opportunityId: string | number; stage: string; lostReason?: string }) =>
  request.put(`/crm/opportunity/${data.opportunityId}/stage`, data)

/** 商机看板视图 */
export const getOpportunityBoard = (params?: ApiRecord) =>
  request.get('/crm/opportunity/board', { params: params || {} })

/** 从商机创建项目草稿 */
export const createProjectDraft = (opportunityId: string | number, data?: ApiRecord) =>
  request.post(`/crm/opportunity/${opportunityId}/project-draft`, data || {})

/** 报价管理 */
export const listQuotes = (params?: CrmListParams) => listCrmPage('quote', params)
export const addQuote = (data: CrmRecord) => createCrmRecord('quote', data)
export const editQuote = (data: CrmRecord) => updateCrmRecord('quote', data)
export const removeQuote = (ids: Array<string | number>) => deleteCrmRecords('quote', ids)

/** 获取报价详情 */
export const getQuoteDetail = (id: string | number) => request.get(`/crm/quote/${id}`)

/** 提交报价 */
export const submitQuote = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/quote/submit/${id}`, data || {})

/** 发送报价 */
export const sendQuote = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/quote/${id}/send`, data || {})

/** 接受报价 */
export const acceptQuote = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/quote/${id}/accept`, data || {})

/** 报价过期 */
export const expireQuote = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/quote/${id}/expire`, data || {})

/** 从报价生成合同草稿 */
export const createContractDraft = (quoteId: string | number, data?: ApiRecord) =>
  request.post(`/crm/quote/${quoteId}/contract-draft`, data || {})
