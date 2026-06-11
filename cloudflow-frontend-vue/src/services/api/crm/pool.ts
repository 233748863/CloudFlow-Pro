import request from '@/services/api/request'
import { createCrmRecord, deleteCrmRecords, listCrmPage, updateCrmRecord } from './service'
import type { CrmListParams, CrmRecord } from './types'
import { listPage, type ListParams } from '../page'

/** 客户公海列表 */
export const listCustomerPool = (params?: CrmListParams) => listCrmPage('customer-pool', params)

/** 客户领取 */
export const claimCustomer = (customerId: string | number, reason = '') =>
  request.post(`/crm/customer-pool/${customerId}/claim`, { reason })

/** 客户释放到公海 */
export const releaseCustomer = (customerId: string | number, reason = '') =>
  request.post(`/crm/customer-pool/${customerId}/release`, { reason })

/** 公海日志查询 */
export const listCustomerPoolLogs = (params?: ListParams) =>
  listPage('/crm/customer-pool/logs', params)

/** 客户批量分配 */
export const assignCustomer = (data: { customerIds: Array<string | number>; ownerId: string | number; ownerName?: string }) =>
  request.post('/crm/customer-pool/assign', data)

/** 触发自动释放 */
export const triggerAutoRelease = () =>
  request.post('/crm/customer-pool/auto-release')

/** 分配规则管理 */
export const listAssignmentRules = (params?: CrmListParams) => listCrmPage('assignment-rule', params)
export const addAssignmentRule = (data: CrmRecord) => createCrmRecord('assignment-rule', data)
export const editAssignmentRule = (data: CrmRecord) => updateCrmRecord('assignment-rule', data)
export const removeAssignmentRule = (ids: Array<string | number>) => deleteCrmRecords('assignment-rule', ids)
