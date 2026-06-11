import request from './request'
import { createRecord, listPage, runRecordAction, updateRecord, type ApiRecord, type ListParams } from './page'

/** 预算计划管理 */
export const listBudgetPlans = (params?: ListParams) => listPage('/oa/budget/plan/list', params)
export const createBudgetPlan = (data: ApiRecord) => createRecord('/oa/budget/plan', data)
export const updateBudgetPlan = (data: ApiRecord) => updateRecord('/oa/budget/plan', data)
export const submitBudgetPlan = (id: string | number) => runRecordAction(`/oa/budget/plan/submit/${id}`)

/** 预算计划详情（含明细行） */
export const getPlanDetail = (id: string | number) => request.get(`/oa/budget/plan/${id}/detail`)

/** 预算执行台账 */
export const listBudgetLedger = (params?: ListParams) => listPage('/oa/budget/execution/ledger', params)

/** 预算执行汇总（含预警状态） */
export const getExecutionSummary = (budgetId: string | number, subjectCode?: string) =>
  request.get(`/oa/budget/execution/summary`, { params: { budgetId, subjectCode } })

/** 预算科目管理 */
export const listSubjects = (params?: ListParams) => listPage('/oa/budget/subject/list', params)
export const addSubject = (data: ApiRecord) => request.post('/oa/budget/subject', data)
export const editSubject = (data: ApiRecord) => request.put('/oa/budget/subject', data)

/** 预算调整管理 */
export const listAdjustments = (params?: ListParams) => listPage('/oa/budget/adjustment/list', params)
export const addAdjustment = (data: ApiRecord) => request.post('/oa/budget/adjustment', data)
export const submitAdjustment = (id: string | number, data?: ApiRecord) =>
  request.post(`/oa/budget/adjustment/submit/${id}`, data || {})
