import { listPage, type ListParams } from './page'
import request from './request'

export const listAuditEvents = (params?: ListParams) => listPage('/oa/audit/events', params)
export const exportAuditEvents = (params?: ListParams) =>
  request.get<Blob>('/oa/audit/events/export', { params, responseType: 'blob' })
