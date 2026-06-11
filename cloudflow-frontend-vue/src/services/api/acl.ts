import { createRecord, deleteRecords, listPage, runRecordAction, updateRecord, type ApiRecord, type ListParams } from './page'

export const listIpAclRules = (params?: ListParams) => listPage('/auth/system/ipAcl/page', params)
export const createIpAclRule = (data: ApiRecord) => createRecord('/auth/system/ipAcl', data)
export const updateIpAclRule = (data: ApiRecord) => updateRecord('/auth/system/ipAcl', data)
export const deleteIpAclRule = (id: string | number) => deleteRecords('/auth/system/ipAcl', [id], 'single')
export const setIpAclStatus = (id: string | number, status: 'ACTIVE' | 'INACTIVE') =>
  runRecordAction(`/auth/system/ipAcl/${id}/status?status=${status}`)

export const listUserBlacklist = (params?: ListParams) => listPage('/auth/system/userBlacklist/page', params)
export const banUser = (data: ApiRecord) => createRecord('/auth/system/userBlacklist', data)
export const updateUserBlacklist = (data: ApiRecord) => updateRecord('/auth/system/userBlacklist', data)
export const unbanUser = (id: string | number) => runRecordAction(`/auth/system/userBlacklist/${id}/unban`)
export const deleteUserBlacklist = (id: string | number) => deleteRecords('/auth/system/userBlacklist', [id], 'single')
