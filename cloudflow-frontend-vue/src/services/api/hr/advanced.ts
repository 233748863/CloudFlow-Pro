import { createRecord, deleteRecords, listPage, runRecordAction, updateRecord, type ApiRecord, type ListParams } from '@/services/api/page'

export const listHrAdvancedPage = (path: string, params?: ListParams) => listPage(path, params)
export const createHrAdvancedRecord = (path: string, data: ApiRecord) => createRecord(path, data)
export const updateHrAdvancedRecord = (path: string, id: string | number, data: ApiRecord) => updateRecord(path, data, id, 'path')
export const deleteHrAdvancedRecord = (path: string, id: string | number) => deleteRecords(path, [id], 'single')
export const runHrAdvancedAction = (path: string, payload?: ApiRecord | null) => runRecordAction(path, 'post', payload)
