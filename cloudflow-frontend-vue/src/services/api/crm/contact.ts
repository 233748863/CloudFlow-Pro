import request from '../request'
import { listPage, type ApiRecord, type ListParams } from '../page'

/**
 * CRM 联系人管理 API
 * 对标 React: cloudflow-frontend/src/services/api/crm/contact.ts
 */

/** 联系人列表查询 */
export const listContacts = (params?: ListParams) => listPage('/crm/contact/list', params)

/** 新增联系人 */
export const addContact = (data: ApiRecord) => request.post('/crm/contact', data)

/** 编辑联系人 */
export const editContact = (data: ApiRecord) => request.put('/crm/contact', data)

/** 删除联系人 */
export const removeContact = (ids: Array<string | number>) =>
  request.delete(`/crm/contact/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 获取联系人详情 */
export const getContact = (id: string | number) => request.get(`/crm/contact/${id}`)

/**
 * CRM 跟进记录管理 API
 */

/** 跟进记录列表查询 */
export const listFollowUps = (params?: ListParams) => listPage('/crm/follow-up/list', params)

/** 新增跟进记录 */
export const addFollowUp = (data: ApiRecord) => request.post('/crm/follow-up', data)

/** 编辑跟进记录 */
export const editFollowUp = (data: ApiRecord) => request.put('/crm/follow-up', data)

/** 删除跟进记录 */
export const removeFollowUp = (ids: Array<string | number>) =>
  request.delete(`/crm/follow-up/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 获取跟进记录详情 */
export const getFollowUp = (id: string | number) => request.get(`/crm/follow-up/${id}`)

/** 获取客户的跟进记录 */
export const getCustomerFollowUps = (customerId: string | number, params?: ListParams) =>
  listPage(`/crm/customer/${customerId}/follow-ups`, params)
