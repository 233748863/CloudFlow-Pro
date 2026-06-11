import { createRecord, deleteRecords, listPage, updateRecord, type ApiRecord, type ListParams } from '@/services/api/page'

export const listCrmPage = <T extends ApiRecord = ApiRecord>(resource: string, params?: ListParams) =>
  listPage<T>(`/crm/${resource}/list`, params)

export const createCrmRecord = (resource: string, data: ApiRecord) =>
  createRecord(`/crm/${resource}`, data)

export const updateCrmRecord = (resource: string, data: ApiRecord) =>
  updateRecord(`/crm/${resource}`, data)

export const deleteCrmRecords = (resource: string, ids: Array<string | number>) =>
  deleteRecords(`/crm/${resource}`, ids)
