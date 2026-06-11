import request from './request'
import { createRecord, deleteRecords, listPage, runRecordAction, updateRecord, type ApiRecord, type ListParams } from './page'

/** 发票管理 */
export const listInvoices = (params?: ListParams) => listPage('/oa/invoice/list', params)
export const createInvoice = (data: ApiRecord) => createRecord('/oa/invoice', data)
export const updateInvoice = (data: ApiRecord) => updateRecord('/oa/invoice', data)
export const deleteInvoices = (ids: Array<string | number>) => deleteRecords('/oa/invoice', ids)

/** 发票详情 */
export const getInvoiceInfo = (id: string | number) => request.get(`/oa/invoice/${id}`)

/** 发票作废 */
export const voidInvoice = (id: string | number, remark = '') => runRecordAction(`/oa/invoice/${id}/void`, 'post', { remark })

/** 发票核销记录列表 */
export const listWriteoffs = (invoiceId: string | number) => request.get(`/oa/invoice/${invoiceId}/writeoffs`)

/** 发票业务绑定（应收/报销/付款） */
export const bindInvoice = (invoiceId: string | number, data: {
  bindType: 'receivable' | 'expense' | 'payment'
  bindId: string | number
  amount?: number
}) => request.post(`/oa/invoice/${invoiceId}/bind`, data)

/** 发票核销 */
export const writeoffInvoice = (invoiceId: string | number, data: {
  writeoffAmount: number
  writeoffDate?: string
  remark?: string
}) => request.post(`/oa/invoice/${invoiceId}/writeoff`, data)
