import request from '@/services/api/request'
import { createCrmRecord, deleteCrmRecords, listCrmPage, updateCrmRecord } from './service'
import type { CrmListParams, CrmRecord } from './types'

export const listCustomers = (params?: CrmListParams) => listCrmPage('customer', params)
export const addCustomer = (data: CrmRecord) => createCrmRecord('customer', data)
export const editCustomer = (data: CrmRecord) => updateCrmRecord('customer', data)
export const removeCustomer = (ids: Array<string | number>) => deleteCrmRecords('customer', ids)
export const getCustomerWorkspace = (id: string | number) =>
  request.get<CrmRecord>(`/crm/customer/${id}/workspace`)
export const getCrmDashboardSummary = () =>
  request.get<CrmRecord>('/crm/dashboard/summary')
