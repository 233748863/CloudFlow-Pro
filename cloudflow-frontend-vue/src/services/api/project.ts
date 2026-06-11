import request from './request'
import { createRecord, deleteRecords, listPage, runRecordAction, updateRecord, type ApiRecord, type ListParams } from './page'

/** 项目管理 */
export const listProjects = (params?: ListParams) => listPage('/oa/project/list', params)
export const createProject = (data: ApiRecord) => createRecord('/oa/project', data)
export const updateProject = (data: ApiRecord) => updateRecord('/oa/project', data)
export const deleteProjects = (ids: Array<string | number>) => deleteRecords('/oa/project', ids)

/** 项目基本信息 */
export const getProjectInfo = (id: string | number) => request.get(`/oa/project/${id}`)

/** 项目完整详情（含成员/里程碑/WBS/风险聚合） */
export const getProjectDetail = (id: string | number) => request.get(`/oa/project/${id}/detail`)

/** 项目状态操作 */
export const submitProject = (id: string | number) => runRecordAction(`/oa/project/submit/${id}`)
export const archiveProject = (id: string | number) => runRecordAction(`/oa/project/archive/${id}`)

/** 项目成员管理 */
export const listMembers = (projectId: string | number) => request.get(`/oa/project/${projectId}/members`)
export const addMember = (data: { projectId: string | number; userId: string | number; role?: string }) =>
  request.post('/oa/project/member', data)
export const editMember = (data: { memberId: string | number; role?: string; responsibilities?: string }) =>
  request.put('/oa/project/member', data)
export const removeMember = (ids: Array<string | number>) =>
  request.delete(`/oa/project/member/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 项目里程碑管理 */
export const listMilestones = (projectId: string | number) => request.get(`/oa/project/${projectId}/milestones`)
export const addMilestone = (data: ApiRecord) => request.post('/oa/project/milestone', data)
export const editMilestone = (data: ApiRecord) => request.put('/oa/project/milestone', data)
export const removeMilestone = (ids: Array<string | number>) =>
  request.delete(`/oa/project/milestone/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** WBS 任务管理 */
export const listWbs = (projectId: string | number) => request.get(`/oa/project/${projectId}/wbs`)
export const addWbs = (data: ApiRecord) => request.post('/oa/project/wbs', data)
export const editWbs = (data: ApiRecord) => request.put('/oa/project/wbs', data)
export const updateWbsTree = (projectId: string | number, data: ApiRecord) =>
  request.put(`/oa/project/${projectId}/wbs/tree`, data)
export const removeWbs = (ids: Array<string | number>) =>
  request.delete(`/oa/project/wbs/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 项目风险管理 */
export const listRisks = (projectId: string | number) => request.get(`/oa/project/${projectId}/risks`)
export const addRisk = (data: ApiRecord) => request.post('/oa/project/risk', data)
export const editRisk = (data: ApiRecord) => request.put('/oa/project/risk', data)
export const removeRisk = (ids: Array<string | number>) =>
  request.delete(`/oa/project/risk/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 任务依赖管理 */
export const listDependencies = (projectId: string | number) => request.get(`/oa/project/${projectId}/dependencies`)
export const addDependency = (data: ApiRecord) => request.post('/oa/project/dependency', data)
export const editDependency = (data: ApiRecord) => request.put('/oa/project/dependency', data)
export const removeDependency = (ids: Array<string | number>) =>
  request.delete(`/oa/project/dependency/${Array.isArray(ids) ? ids.join(',') : ids}`)

/** 项目基线管理 */
export const snapshotBaseline = (projectId: string | number, data?: { name?: string; description?: string }) =>
  request.post(`/oa/project/${projectId}/baseline`, data || {})

/** 项目成本汇总 */
export const getCostSummary = (projectId: string | number) => request.get(`/oa/project/${projectId}/cost-summary`)
