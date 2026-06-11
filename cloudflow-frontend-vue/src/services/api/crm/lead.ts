import request from '@/services/api/request'
import { createCrmRecord, deleteCrmRecords, listCrmPage, updateCrmRecord } from './service'
import type { CrmListParams, CrmRecord } from './types'

export const listLeads = (params?: CrmListParams) => listCrmPage('lead', params)
export const addLead = (data: CrmRecord) => createCrmRecord('lead', data)
export const editLead = (data: CrmRecord) => updateCrmRecord('lead', data)
export const removeLead = (ids: Array<string | number>) => deleteCrmRecords('lead', ids)
export const convertLead = (data: CrmRecord) => request.post<number>('/crm/lead/convert', data)
