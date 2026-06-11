import request from '../request'
import { listPage, type ApiRecord, type ListParams } from '../page'

/**
 * CRM 服务工单管理 API
 * 对标 React: cloudflow-frontend/src/services/api/crm/service.ts
 */

/** 工单列表查询 */
export const listTickets = (params?: ListParams) => listPage('/crm/ticket/list', params)

/** 新增工单 */
export const addTicket = (data: ApiRecord) => request.post('/crm/ticket', data)

/** 编辑工单 */
export const editTicket = (data: ApiRecord) => request.put('/crm/ticket', data)

/** 删除工单 */
export const removeTicket = (ids: Array<string | number>) =>
  request.delete(`/crm/ticket/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 获取工单详情 */
export const getTicket = (id: string | number) => request.get(`/crm/ticket/${id}`)

/** 解决工单 */
export const resolveTicket = (id: string | number, data: ApiRecord) =>
  request.post(`/crm/ticket/${id}/resolve`, data)

/** 关闭工单 */
export const closeTicket = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/ticket/${id}/close`, data || {})

/** 重新打开工单 */
export const reopenTicket = (id: string | number, data?: ApiRecord) =>
  request.post(`/crm/ticket/${id}/reopen`, data || {})

/** 分配工单 */
export const assignTicket = (id: string | number, data: ApiRecord) =>
  request.post(`/crm/ticket/${id}/assign`, data)

/** 工单升级 */
export const escalateTicket = (id: string | number, data: ApiRecord) =>
  request.post(`/crm/ticket/${id}/escalate`, data)

/** 获取工单时间线 */
export const getTicketTimeline = (id: string | number) =>
  request.get(`/crm/ticket/${id}/timeline`)

/** 工单 SLA 统计 */
export const getTicketSlaStatistics = (params?: ApiRecord) =>
  request.get('/crm/ticket/sla-statistics', { params: params || {} })
