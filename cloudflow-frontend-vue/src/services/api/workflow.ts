import request from '@/services/api/request'

export type WorkflowRecord = Record<string, unknown>

export interface WorkflowPageResult<T extends WorkflowRecord = WorkflowRecord> {
  list?: T[]
  records?: T[]
  rows?: T[]
  total?: number
  current?: number
  size?: number
  pageNum?: number
  pageSize?: number
}

export interface ProcessDefinitionSummary extends WorkflowRecord {
  definitionId?: string
  processName?: string
  processKey?: string
  version?: number
  formId?: string
  status?: string
  modelJson?: string
  category?: string
  tags?: string
  description?: string
  startPermissionType?: string
  startPermissionValue?: string
  currentVersion?: string
  isLatest?: number
  isArchived?: number
  createTime?: string
  updateTime?: string
}

export interface ProcessDefinitionQuery extends WorkflowRecord {
  status?: string
  latestOnly?: boolean
  keyword?: string
  category?: string
  pageNum?: number
  pageSize?: number
}

export interface FormDefinitionSummary extends WorkflowRecord {
  formId?: string
  formKey?: string
  formName?: string
  fieldsJson?: string
  formSchema?: string
  version?: number
  versionLock?: number
  isLatest?: number
  status?: string
  createTime?: string
}

export interface ProcessCategory extends WorkflowRecord {
  categoryId?: number
  parentId?: number
  categoryName?: string
  categoryCode?: string
  icon?: string
  sortOrder?: number
  status?: string
  remark?: string
  parentName?: string
  children?: ProcessCategory[]
}

export interface DeployWindow extends WorkflowRecord {
  id?: number
  windowName?: string
  windowType?: string
  startTime?: string
  endTime?: string
  weekDays?: string
  monthDays?: string
  customDates?: string
  isEnabled?: boolean
  description?: string
  createTime?: string
  updateTime?: string
}

export interface WorkflowOverview extends WorkflowRecord {
  todayStarted?: number
  todayCompleted?: number
  todayTimeout?: number
  todayAnomaly?: number
  runningCount?: number
  pendingTaskCount?: number
  warningAlertCount?: number
  criticalAlertCount?: number
  unresolvedAnomalyCount?: number
  avgCompletionTimeMs?: number
  successRate?: number
}

export interface ValidationResult extends WorkflowRecord {
  valid?: boolean
  workflowName?: string
  version?: string
  errors?: string[]
  warnings?: string[]
  unsupportedNodeTypes?: string[]
  unsupportedIntegrations?: string[]
  hasNameConflict?: boolean
  checksumValid?: boolean
  details?: string
}

export interface ImportResult extends WorkflowRecord {
  success?: boolean
  workflowId?: string
  workflowName?: string
  action?: string
  errors?: string[]
  warnings?: string[]
  message?: string
}

export const normalizeWorkflowRows = <T extends WorkflowRecord>(data: WorkflowPageResult<T> | T[] | null | undefined): T[] => {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.list)) return data.list
  if (Array.isArray(data.records)) return data.records
  if (Array.isArray(data.rows)) return data.rows
  return []
}

export const getWorkflowTotal = <T extends WorkflowRecord>(data: WorkflowPageResult<T> | T[] | null | undefined, fallback = 0) => {
  if (!data) return fallback
  if (Array.isArray(data)) return data.length
  return Number(data.total ?? data.list?.length ?? data.records?.length ?? data.rows?.length ?? fallback)
}

const buildPageQuery = (params?: WorkflowRecord) => {
  const query: WorkflowRecord = {
    pageNum: params?.pageNum ?? 1,
    pageSize: params?.pageSize ?? 10
  }
  Object.entries(params || {}).forEach(([key, value]) => {
    if (['pageNum', 'pageSize'].includes(key) || value === '' || value === undefined || value === null) return
    query[`params[${key}]`] = typeof value === 'boolean' ? String(value) : value
  })
  return query
}

const normalizeArchiveDateTime = (value: string | undefined, isEnd: boolean) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed} ${isEnd ? '23:59:59' : '00:00:00'}`
  return trimmed
}

export const getProcessDefinitions = (params?: ProcessDefinitionQuery) =>
  request.get<WorkflowPageResult<ProcessDefinitionSummary>>('/workflow/definitions', { params: buildPageQuery(params) })

export const getProcessDefinition = (definitionId: string | number) =>
  request.get<ProcessDefinitionSummary>(`/workflow/definition/${definitionId}`)

export const saveProcessDefinition = (data: WorkflowRecord) =>
  request.post<WorkflowRecord>('/workflow/definition/save', data)

export const deployProcessDefinition = (definitionId: string | number) =>
  request.post<void>(`/workflow/definition/deploy/${definitionId}`)

export const deleteProcessDefinition = (definitionId: string | number) =>
  request.delete<void>(`/workflow/definition/${definitionId}`)

export const getFormDefinitions = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<FormDefinitionSummary>>('/workflow/forms', { params: buildPageQuery(params) })

export const getFormDefinition = (formId: string | number) =>
  request.get<FormDefinitionSummary>(`/workflow/form/${formId}`)

export const saveFormDefinition = (data: WorkflowRecord) =>
  request.post<void>('/workflow/form/save', data)

export const getProcessCategories = () =>
  request.get<ProcessCategory[]>('/workflow/category/list')

export const getProcessCategoryTree = () =>
  request.get<ProcessCategory[]>('/workflow/category/tree')

export const createProcessCategory = (data: WorkflowRecord) =>
  request.post<void>('/workflow/category', data)

export const updateProcessCategory = (data: WorkflowRecord) =>
  request.put<void>('/workflow/category', data)

export const deleteProcessCategory = (categoryId: string | number) =>
  request.delete<void>(`/workflow/category/${categoryId}`)

export const getMonitorOverview = () =>
  request.get<WorkflowOverview>('/workflow/monitor/overview')

export const getProcessTrend = (params?: WorkflowRecord) =>
  request.get<WorkflowRecord[]>('/workflow/monitor/trend', { params })

export const getProcessMonitorList = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/monitor/process/list', { params })

export const getTimeoutAlertList = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/monitor/timeout/list', { params })

export const getAnomalyAlertList = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/monitor/anomaly/list', { params })

export const handleTimeoutAlert = (alertId: string | number, action: string) =>
  request.post<void>(`/workflow/monitor/timeout/${alertId}/handle`, { action })

export const resolveTimeoutMonitorAlert = (alertId: string | number, resolveNote: string) =>
  request.post<void>(`/workflow/monitor/timeout/${alertId}/resolve`, { resolveNote })

export const resolveAnomalyMonitorAlert = (alertId: string | number, resolveNote: string) =>
  request.post<void>(`/workflow/monitor/anomaly/${alertId}/resolve`, { resolveNote })

export const getPerformanceStats = (params?: WorkflowRecord) =>
  request.get<WorkflowRecord[]>('/workflow/monitor/performance/stats', { params })

export const getStatisticsMetrics = () =>
  request.get<WorkflowRecord>('/workflow/statistics/metrics')

export const getStatisticsAnalysis = () =>
  request.get<WorkflowRecord>('/workflow/statistics/analysis')

export const getTaskStatistics = (params?: WorkflowRecord) =>
  request.get<WorkflowRecord>('/workflow/tasks/statistics', { params })

export const getTaskGroups = (params?: WorkflowRecord) =>
  request.get<WorkflowRecord>('/workflow/tasks/groups', { params })

export const getTodoTasks = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/todo', { params: buildPageQuery({ pageSize: 80, ...params }) })

export const getDoneTasks = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/done', { params: buildPageQuery({ pageSize: 80, ...params }) })

export const getMyInstances = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/my-instances', { params: buildPageQuery({ pageSize: 80, ...params }) })

export const startProcess = (data: WorkflowRecord) =>
  request.post<WorkflowRecord>('/workflow/start', data)

export const completeTask = (data: WorkflowRecord) =>
  request.post<WorkflowRecord>('/workflow/complete', data)

export const recallProcess = (instanceId: string | number) =>
  request.post<WorkflowRecord>('/workflow/recall', { instanceId: String(instanceId) })

export const readWorkflowTask = (taskId: string | number) =>
  request.post<void>(`/workflow/task/read/${taskId}`)

export const urgeWorkflowTask = (taskId: string | number, reason: string) =>
  request.post<WorkflowRecord>('/workflow/task/urge', { taskId: String(taskId), reason })

export const getTaskCounts = () =>
  request.get<WorkflowRecord>('/workflow/tasks/count')

export const getProcessInstance = (instanceId: string | number) =>
  request.get<WorkflowRecord>(`/workflow/instance/${instanceId}`)

export const getProcessTrace = (instanceId: string | number) =>
  request.get<WorkflowRecord>(`/workflow/instance/${instanceId}/trace`)

export const getCopyUnreadCount = () =>
  request.get<number>('/workflow/copy/unread-count')

export const getMyCopyList = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/copy/list', { params: buildPageQuery(params) })

export const markCopyAsRead = (copyId: string | number) =>
  request.post<void>(`/workflow/copy/read/${copyId}`)

export const batchMarkCopyAsRead = (copyIds: Array<string | number>) =>
  request.post<void>('/workflow/copy/batch-read', { copyIds: copyIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id)) })

export const getWorkflowTemplates = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/templates', { params })

export const getWorkflowTemplateTags = (limit = 12) =>
  request.get<string[]>('/workflow/templates/tags', { params: { limit } })

export const getWorkflowTemplateCategories = () =>
  request.get<WorkflowRecord[]>('/workflow/templates/categories')

export const getWorkflowTemplate = (id: string | number) =>
  request.get<WorkflowRecord>(`/workflow/templates/${id}`)

export const createWorkflowFromTemplate = (id: string | number, data: WorkflowRecord) =>
  request.post<WorkflowRecord>(`/workflow/templates/${id}/create-workflow`, data)

export const listDeployWindows = () =>
  request.get<DeployWindow[]>('/workflow/deploy/window/list')

export const saveDeployWindow = (data: WorkflowRecord) =>
  request.post<void>('/workflow/deploy/window/save', data)

export const updateDeployWindow = (data: WorkflowRecord) =>
  request.put<void>('/workflow/deploy/window/update', data)

export const deleteDeployWindow = (windowId: string | number) =>
  request.delete<void>(`/workflow/deploy/window/delete/${windowId}`)

export const toggleDeployWindow = (windowId: string | number, enabled: boolean) =>
  request.put<void>(`/workflow/deploy/window/toggle/${windowId}`, undefined, { params: { enabled } })

export const checkDeployWindow = () =>
  request.get<WorkflowRecord>('/workflow/deploy/window/check')

export const listPendingDeployApprovals = () =>
  request.get<WorkflowRecord[]>('/workflow/deploy/approval/pending')

export const listMySubmittedDeployApprovals = () =>
  request.get<WorkflowRecord[]>('/workflow/deploy/approval/my-submitted')

export const submitDeployApproval = (definitionId: string | number, data: WorkflowRecord) =>
  request.post<void>(`/workflow/deploy/approval/submit/${definitionId}`, data)

export const cancelDeployApproval = (approvalId: string | number) =>
  request.post<void>(`/workflow/deploy/approval/cancel/${approvalId}`)

export const getArchivedWorkflows = (params?: WorkflowRecord) =>
  request.get<WorkflowPageResult<WorkflowRecord>>('/workflow/batch/archived', {
    params: {
      pageNum: params?.pageNum ?? 1,
      pageSize: params?.pageSize ?? 10,
      keyword: params?.keyword || undefined,
      archivedAfter: normalizeArchiveDateTime(params?.archivedAfter as string | undefined, false),
      archivedBefore: normalizeArchiveDateTime(params?.archivedBefore as string | undefined, true)
    }
  })

export const archiveWorkflows = (workflowIds: Array<string | number>, reason: string) =>
  request.post<WorkflowRecord>('/workflow/batch/archive', { workflowIds: workflowIds.map(String), reason })

export const restoreWorkflows = (workflowIds: Array<string | number>) =>
  request.post<WorkflowRecord>('/workflow/batch/restore', { workflowIds: workflowIds.map(String) })

export const permanentDeleteWorkflows = (workflowIds: Array<string | number>) =>
  request.delete<WorkflowRecord>('/workflow/batch/permanent', { data: { workflowIds: workflowIds.map(String), confirmed: true } })

export const checkOperationSafety = (workflowIds: Array<string | number>) =>
  request.post<WorkflowRecord>('/workflow/batch/check-safety', { workflowIds: workflowIds.map(String) })

export const validateImportFile = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<ValidationResult>('/workflow/import-export/import/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const importWorkflow = (file: File, conflictStrategy = 'skip') => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<ImportResult>('/workflow/import-export/import', formData, {
    params: { conflictStrategy },
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const importWorkflows = (files: File[], conflictStrategy = 'skip') => {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  return request.post<ImportResult[]>('/workflow/import-export/import/batch', formData, {
    params: { conflictStrategy },
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const exportWorkflow = (workflowId: string | number, includeSensitive = false) =>
  request.get<Blob | File>(`/workflow/import-export/export/${workflowId}`, {
    params: { includeSensitive },
    responseType: 'blob'
  })

export const exportWorkflows = (workflowIds: Array<string | number>, includeSensitive = false) =>
  request.post<Blob | File>('/workflow/import-export/export/batch', {
    workflowIds: workflowIds.map(String),
    includeSensitive
  }, {
    responseType: 'blob'
  })

export const getUnresolvedTimeoutAlerts = () =>
  request.get<WorkflowRecord[]>('/workflow/alert/timeout/unresolved')

export const getUnresolvedAnomalyAlerts = () =>
  request.get<WorkflowRecord[]>('/workflow/alert/anomaly/unresolved')

export const resolveTimeoutAlert = (alertId: string | number, resolver: string, solution: string) =>
  request.put<void>(`/workflow/alert/timeout/${alertId}/resolve`, undefined, { params: { resolver, solution } })

export const escalateTimeoutAlert = (alertId: string | number) =>
  request.put<void>(`/workflow/alert/timeout/${alertId}/escalate`)

export const resolveAnomalyAlert = (alertId: string | number, resolver: string, solution: string) =>
  request.put<void>(`/workflow/alert/anomaly/${alertId}/resolve`, undefined, { params: { resolver, solution } })
