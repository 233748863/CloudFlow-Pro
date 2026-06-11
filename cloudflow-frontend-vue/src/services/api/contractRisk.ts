import { createRecord, deleteRecords, listPage, updateRecord, type ApiRecord, type ListParams } from './page'

export const listContractThresholds = (params?: ListParams) => listPage('/oa/contract/threshold/page', params)
export const createContractThreshold = (data: ApiRecord) => createRecord('/oa/contract/threshold', data)
export const updateContractThreshold = (data: ApiRecord) => updateRecord('/oa/contract/threshold', data)
export const deleteContractThreshold = (id: string | number) => deleteRecords('/oa/contract/threshold', [id], 'single')
