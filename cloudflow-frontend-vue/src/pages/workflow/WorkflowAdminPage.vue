<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Archive,
  Download,
  Edit3,
  FileCheck2,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload
} from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, Input, Pagination, Panel, Select, StatCard, StatusBadge, TextArea, type Column } from '@/components/common'
import {
  archiveWorkflows,
  checkDeployWindow,
  checkOperationSafety,
  createProcessCategory,
  deleteDeployWindow,
  deleteProcessCategory,
  deleteProcessDefinition,
  deployProcessDefinition,
  escalateTimeoutAlert,
  exportWorkflow,
  exportWorkflows,
  getAnomalyAlertList,
  getArchivedWorkflows,
  getFormDefinitions,
  getMonitorOverview,
  getPerformanceStats,
  getProcessCategories,
  getProcessDefinitions,
  getProcessMonitorList,
  getProcessTrend,
  getTimeoutAlertList,
  handleTimeoutAlert,
  importWorkflow,
  importWorkflows,
  listDeployWindows,
  listMySubmittedDeployApprovals,
  listPendingDeployApprovals,
  normalizeWorkflowRows,
  permanentDeleteWorkflows,
  restoreWorkflows,
  resolveAnomalyMonitorAlert,
  resolveTimeoutMonitorAlert,
  saveDeployWindow,
  saveFormDefinition,
  saveProcessDefinition,
  toggleDeployWindow,
  updateDeployWindow,
  updateProcessCategory,
  validateImportFile,
  type ImportResult,
  type ValidationResult,
  type WorkflowOverview,
  type WorkflowRecord
} from '@/services/api/workflow'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  formatPercent,
  optionLabel,
  statusTone,
  workflowPageConfigByPath,
  type WorkflowAdminRecord,
  type WorkflowFieldConfig,
  type WorkflowPageConfig
} from '@/pages/workflow/workflowPageConfigs'
import { formatNumber } from '@/pages/hr/hrUtils'

const route = useRoute()
const toast = useToastStore()

const config = computed<WorkflowPageConfig>(() => {
  const matched = workflowPageConfigByPath.get(route.path)
  if (matched) return matched
  return workflowPageConfigByPath.get('/workflow') as WorkflowPageConfig
})

const loading = ref(false)
const saving = ref(false)
const rows = ref<WorkflowAdminRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = ref<WorkflowAdminRecord>({})
const form = ref<WorkflowAdminRecord>({})
const dialogOpen = ref(false)
const editingRow = ref<WorkflowAdminRecord | null>(null)
const pendingDelete = ref<WorkflowAdminRecord | null>(null)
const pendingAction = ref<{ label: string; message: string; run: () => Promise<unknown> } | null>(null)
const alertKind = ref<'timeout' | 'anomaly'>('timeout')
const selectedFiles = ref<File[]>([])
const validationResult = ref<ValidationResult | null>(null)
const importResults = ref<ImportResult[]>([])
const conflictStrategy = ref('skip')
const monitorOverview = ref<WorkflowOverview | null>(null)
const processTrend = ref<WorkflowRecord[]>([])
const deployWindowState = ref<WorkflowRecord | null>(null)
const pendingApprovals = ref<WorkflowRecord[]>([])
const submittedApprovals = ref<WorkflowRecord[]>([])

const tableFields = computed(() => config.value.fields.filter((field) => field.table !== false && field.key !== config.value.idKey))
const filterFields = computed(() => config.value.fields.filter((field) => field.filter))
const formFields = computed(() => config.value.fields.filter((field) => !field.hiddenInForm && field.key !== config.value.idKey))
const canWrite = computed(() => !config.value.readOnly && ['definitions', 'forms', 'category', 'deploy'].includes(config.value.mode))
const hasFilters = computed(() => Object.values(filters.value).some((value) => String(value ?? '').trim()))
const isAlertPage = computed(() => config.value.mode === 'alerts')

const columns = computed<Column<WorkflowAdminRecord>[]>(() => [
  { key: config.value.idKey, label: 'ID', sortable: true },
  ...tableFields.value.map((field) => ({ key: field.key, label: field.label, sortable: field.sortable })),
  { key: 'actions', label: '操作', class: 'text-right' }
])

const dialogTitle = computed(() => editingRow.value ? `编辑${config.value.title}` : `新增${config.value.title}`)

function isRecordId(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}

function toRecordId(value: unknown) {
  return isRecordId(value) ? value : null
}

function toInputModelValue(value: unknown): string | number | null | undefined {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string' || typeof value === 'number' || value == null) return value
  return String(value)
}

const summaryCards = computed(() => {
  if (config.value.mode === 'monitor') {
    return [
      { title: '今日发起', value: formatNumber(monitorOverview.value?.todayStarted || 0) },
      { title: '运行中', value: formatNumber(monitorOverview.value?.runningCount || 0) },
      { title: '待处理任务', value: formatNumber(monitorOverview.value?.pendingTaskCount || 0) },
      { title: '成功率', value: formatPercent(monitorOverview.value?.successRate || 0) }
    ]
  }
  if (config.value.mode === 'deploy') {
    return [
      { title: '发布窗口', value: formatNumber(total.value) },
      { title: '待审批', value: formatNumber(pendingApprovals.value.length) },
      { title: '我提交的', value: formatNumber(submittedApprovals.value.length) },
      { title: '当前可发布', value: String(deployWindowState.value?.allowed ?? deployWindowState.value?.inWindow ?? false) === 'true' ? '是' : '否' }
    ]
  }
  if (config.value.mode === 'performance') {
    const completed = rows.value.reduce((sum, row) => sum + Number(row.completedCount || 0), 0)
    const failed = rows.value.reduce((sum, row) => sum + Number(row.failedCount || 0), 0)
    const timeout = rows.value.reduce((sum, row) => sum + Number(row.timeoutCount || 0), 0)
    return [
      { title: '统计记录', value: formatNumber(rows.value.length) },
      { title: '完成数', value: formatNumber(completed) },
      { title: '失败数', value: formatNumber(failed) },
      { title: '超时数', value: formatNumber(timeout) }
    ]
  }
  if (config.value.mode === 'alerts') {
    const unresolved = rows.value.filter((row) => !isResolved(row.resolved)).length
    const critical = rows.value.filter((row) => ['CRITICAL', 'HIGH'].includes(String(row.timeoutLevel ?? row.severity ?? '').toUpperCase())).length
    return [
      { title: '告警总数', value: formatNumber(total.value) },
      { title: '未解决', value: formatNumber(unresolved) },
      { title: '严重告警', value: formatNumber(critical) },
      { title: '当前分类', value: alertKind.value === 'timeout' ? '超时' : '异常' }
    ]
  }
  const activeCount = rows.value.filter((row) => ['PUBLISHED', '0', 'TRUE', '1'].includes(String(row.status ?? row.isEnabled ?? '').toUpperCase())).length
  const draftCount = rows.value.filter((row) => ['DRAFT', 'PENDING'].includes(String(row.status ?? '').toUpperCase())).length
  return [
    { title: '总数', value: formatNumber(total.value) },
    { title: '本页记录', value: formatNumber(rows.value.length) },
    { title: '启用/发布', value: formatNumber(activeCount) },
    { title: '草稿/待处理', value: formatNumber(draftCount) }
  ]
})

function isResolved(value: unknown) {
  const normalized = String(value ?? '').toUpperCase()
  return ['Y', 'TRUE', '1'].includes(normalized)
}

function normalizeFieldValue(field: WorkflowFieldConfig, value: unknown): string | number | boolean | null | undefined {
  if (field.type === 'number') {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : undefined
  }
  if (field.type === 'datetime-local' && typeof value === 'string' && value) {
    return value.replace('T', ' ').length === 16 ? `${value.replace('T', ' ')}:00` : value.replace('T', ' ')
  }
  if (value === 'true') return true
  if (value === 'false') return false
  return value as string | number | boolean | null | undefined
}

function normalizeInputValue(field: WorkflowFieldConfig, value: unknown) {
  if (value == null || value === '') return field.defaultValue ?? ''
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value)
  if (field.type === 'date') return text.slice(0, 10)
  if (field.type === 'datetime-local') return text.replace(' ', 'T').slice(0, 16)
  if (typeof value === 'boolean') return value
  return value as string | number | boolean | null | undefined
}

function getDefaultForm() {
  const next: WorkflowAdminRecord = {}
  formFields.value.forEach((field) => {
    next[field.key] = field.defaultValue ?? ''
  })
  return next
}

function cleanPayload(source: WorkflowAdminRecord) {
  const payload: WorkflowAdminRecord = {}
  formFields.value.forEach((field) => {
    const value = source[field.key]
    if (value === '' || value === undefined) return
    payload[field.key] = normalizeFieldValue(field, value)
  })
  if (editingRow.value?.[config.value.idKey] != null) {
    payload[config.value.idKey] = editingRow.value[config.value.idKey]
  }
  return payload
}

function updateFormValue(key: string, value: string) {
  form.value[key] = value
}

function openDialog(row?: WorkflowAdminRecord) {
  editingRow.value = row || null
  const next = getDefaultForm()
  if (row) {
    formFields.value.forEach((field) => {
      next[field.key] = normalizeInputValue(field, row[field.key])
    })
  }
  form.value = next
  dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  editingRow.value = null
}

function fieldByKey(key: string) {
  return config.value.fields.find((field) => field.key === key)
}

function formatCell(field: WorkflowFieldConfig | undefined, value: unknown, row: WorkflowAdminRecord) {
  if (!field) return String(value ?? '-')
  if (field.formatter) return field.formatter(value, row)
  if (field.type === 'select') return optionLabel(field.options, value)
  if (field.type === 'date') return value ? String(value).slice(0, 10) : '-'
  if (field.type === 'datetime-local') return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value ?? '-')
}

function getFilterParams() {
  const params: WorkflowAdminRecord = {
    pageNum: page.value,
    pageSize: pageSize.value
  }
  filterFields.value.forEach((field) => {
    const value = filters.value[field.key]
    if (String(value ?? '').trim()) params[field.key] = normalizeFieldValue(field, value)
  })
  return params
}

function filterLocalRows(items: WorkflowAdminRecord[]) {
  const activeFilters = filterFields.value.filter((field) => String(filters.value[field.key] ?? '').trim())
  if (!activeFilters.length) return items
  return items.filter((item) => activeFilters.every((field) => {
    const expected = String(filters.value[field.key] ?? '').toLowerCase()
    const actual = String(item[field.key] ?? '').toLowerCase()
    return actual.includes(expected)
  }))
}

async function fetchRows() {
  loading.value = true
  try {
    const params = getFilterParams()
    let data: WorkflowRecord[] | { records?: WorkflowRecord[]; rows?: WorkflowRecord[]; total?: number } = []

    if (['definitions', 'management', 'import'].includes(config.value.mode)) {
      data = await getProcessDefinitions({
        ...params,
        latestOnly: config.value.mode !== 'management'
      })
    } else if (config.value.mode === 'forms') {
      data = await getFormDefinitions(params)
    } else if (config.value.mode === 'category') {
      const allRows = filterLocalRows((await getProcessCategories()) as WorkflowAdminRecord[])
      total.value = allRows.length
      rows.value = allRows.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
      return
    } else if (config.value.mode === 'deploy') {
      await fetchDeployExtras()
      const allRows = filterLocalRows((await listDeployWindows()) as WorkflowAdminRecord[])
      total.value = allRows.length
      rows.value = allRows.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
      return
    } else if (config.value.mode === 'monitor') {
      await fetchMonitorExtras()
      data = await getProcessMonitorList(params)
    } else if (config.value.mode === 'archived') {
      data = await getArchivedWorkflows(params)
    } else if (config.value.mode === 'alerts') {
      data = alertKind.value === 'timeout'
        ? await getTimeoutAlertList(params)
        : await getAnomalyAlertList(params)
    } else if (config.value.mode === 'performance') {
      const perfRows = await getPerformanceStats(params)
      const localRows = filterLocalRows(perfRows as WorkflowAdminRecord[])
      total.value = localRows.length
      rows.value = localRows.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
      return
    }

    rows.value = normalizeWorkflowRows(data).filter(Boolean) as WorkflowAdminRecord[]
    total.value = Array.isArray(data) ? data.length : Number(data.total ?? rows.value.length)
  } catch (error) {
    rows.value = []
    total.value = 0
    toast.error(getErrorMessage(error, `${config.value.title}加载失败`))
  } finally {
    loading.value = false
  }
}

async function fetchMonitorExtras() {
  const [overview, trend] = await Promise.all([
    getMonitorOverview(),
    getProcessTrend({ days: 7 })
  ])
  monitorOverview.value = overview
  processTrend.value = trend
}

async function fetchDeployExtras() {
  const [windowState, pending, submitted] = await Promise.all([
    checkDeployWindow(),
    listPendingDeployApprovals(),
    listMySubmittedDeployApprovals()
  ])
  deployWindowState.value = windowState
  pendingApprovals.value = pending
  submittedApprovals.value = submitted
}

function searchRows() {
  page.value = 1
  void fetchRows()
}

function resetFilters() {
  filters.value = {}
  page.value = 1
  void fetchRows()
}

async function saveRow() {
  for (const field of formFields.value) {
    if (field.required && !String(form.value[field.key] ?? '').trim()) {
      toast.error(`请填写${field.label}`)
      return
    }
  }

  saving.value = true
  try {
    const payload = cleanPayload(form.value)
    if (config.value.mode === 'definitions') await saveProcessDefinition(payload)
    else if (config.value.mode === 'forms') await saveFormDefinition(payload)
    else if (config.value.mode === 'category') {
      if (editingRow.value) await updateProcessCategory(payload)
      else await createProcessCategory(payload)
    } else if (config.value.mode === 'deploy') {
      if (editingRow.value) await updateDeployWindow(payload)
      else await saveDeployWindow(payload)
    }
    closeDialog()
    toast.success('保存成功')
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  const id = toRecordId(pendingDelete.value[config.value.idKey])
  if (id == null) return
  saving.value = true
  try {
    if (config.value.mode === 'definitions') await deleteProcessDefinition(id)
    else if (config.value.mode === 'category') await deleteProcessCategory(id)
    else if (config.value.mode === 'deploy') await deleteDeployWindow(id)
    pendingDelete.value = null
    toast.success('删除成功')
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    saving.value = false
  }
}

function requestAction(label: string, message: string, run: () => Promise<unknown>) {
  pendingAction.value = { label, message, run }
}

async function confirmAction() {
  if (!pendingAction.value) return
  const action = pendingAction.value
  saving.value = true
  try {
    await action.run()
    pendingAction.value = null
    toast.success(`${action.label}成功`)
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, `${action.label}失败`))
  } finally {
    saving.value = false
  }
}

function deployRow(row: WorkflowAdminRecord) {
  const id = toRecordId(row.definitionId)
  if (id == null) return
  requestAction('发布', `确认发布流程“${row.processName || id}”？`, () => deployProcessDefinition(id))
}

function archiveRow(row: WorkflowAdminRecord) {
  const id = toRecordId(row.definitionId)
  if (id == null) return
  requestAction('归档', `确认归档流程“${row.processName || id}”？`, () => archiveWorkflows([id], '前端批量编辑归档'))
}

function restoreRow(row: WorkflowAdminRecord) {
  const id = toRecordId(row.workflowId)
  if (id == null) return
  requestAction('恢复', `确认恢复归档流程“${row.workflowName || id}”？`, () => restoreWorkflows([id]))
}

function permanentDeleteRow(row: WorkflowAdminRecord) {
  const id = toRecordId(row.workflowId)
  if (id == null) return
  requestAction('永久删除', `永久删除“${row.workflowName || id}”？该操作不可撤销。`, () => permanentDeleteWorkflows([id]))
}

function toggleDeployRow(row: WorkflowAdminRecord) {
  const id = toRecordId(row.id)
  if (id == null) return
  const nextEnabled = !row.isEnabled
  requestAction(nextEnabled ? '启用' : '停用', `确认${nextEnabled ? '启用' : '停用'}发布窗口“${row.windowName || id}”？`, () => toggleDeployWindow(id, nextEnabled))
}

function handleAlertRow(row: WorkflowAdminRecord, action: 'notify' | 'escalate' | 'resolve') {
  const id = toRecordId(row.id)
  if (id == null) return
  if (alertKind.value === 'timeout') {
    if (action === 'resolve') {
      requestAction('解决告警', `确认解决超时告警“${row.targetName || id}”？`, () => resolveTimeoutMonitorAlert(id, '前端标记解决'))
      return
    }
    requestAction(action === 'notify' ? '发送通知' : '升级告警', `确认${action === 'notify' ? '发送通知' : '升级'}“${row.targetName || id}”？`, () => action === 'escalate' ? escalateTimeoutAlert(id) : handleTimeoutNotify(id))
    return
  }
  requestAction('解决告警', `确认解决异常告警“${row.processName || row.nodeName || id}”？`, () => resolveAnomalyMonitorAlert(id, '前端标记解决'))
}

const handleTimeoutNotify = (id: string | number) => handleTimeoutAlert(id, 'notify')

async function safetyCheck(row: WorkflowAdminRecord) {
  const id = toRecordId(row.definitionId)
  if (id == null) return
  saving.value = true
  try {
    const result = await checkOperationSafety([id])
    const safe = String(result.safe ?? '').toLowerCase() === 'true'
    toast[ safe ? 'success' : 'error' ](String(result.message || (safe ? '安全检查通过' : '安全检查未通过')))
  } catch (error) {
    toast.error(getErrorMessage(error, '安全检查失败'))
  } finally {
    saving.value = false
  }
}

async function downloadRow(row: WorkflowAdminRecord) {
  const id = toRecordId(row.definitionId)
  if (id == null) return
  saving.value = true
  try {
    const file = await exportWorkflow(id)
    triggerDownload(file, `${row.processName || id}.json`)
    toast.success('导出成功')
  } catch (error) {
    toast.error(getErrorMessage(error, '导出失败'))
  } finally {
    saving.value = false
  }
}

async function downloadCurrentPage() {
  const ids = rows.value.map((row) => row.definitionId).filter(isRecordId)
  if (!ids.length) return
  saving.value = true
  try {
    const file = await exportWorkflows(ids)
    triggerDownload(file, 'workflow-export.json')
    toast.success('批量导出成功')
  } catch (error) {
    toast.error(getErrorMessage(error, '批量导出失败'))
  } finally {
    saving.value = false
  }
}

function triggerDownload(file: Blob | File, fallbackName: string) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file instanceof File && file.name ? file.name : fallbackName
  link.click()
  URL.revokeObjectURL(url)
}

function onFileChange(event: Event) {
  selectedFiles.value = Array.from((event.target as HTMLInputElement).files || [])
  validationResult.value = null
  importResults.value = []
}

async function validateSelectedFiles() {
  if (!selectedFiles.value.length) {
    toast.error('请选择导入文件')
    return
  }
  saving.value = true
  try {
    validationResult.value = await validateImportFile(selectedFiles.value[0])
    toast[validationResult.value.valid ? 'success' : 'error'](validationResult.value.valid ? '校验通过' : '校验未通过')
  } catch (error) {
    toast.error(getErrorMessage(error, '校验失败'))
  } finally {
    saving.value = false
  }
}

async function importSelectedFiles() {
  if (!selectedFiles.value.length) {
    toast.error('请选择导入文件')
    return
  }
  saving.value = true
  try {
    const result = selectedFiles.value.length === 1
      ? [await importWorkflow(selectedFiles.value[0], conflictStrategy.value)]
      : await importWorkflows(selectedFiles.value, conflictStrategy.value)
    importResults.value = result
    toast.success('导入请求已完成')
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, '导入失败'))
  } finally {
    saving.value = false
  }
}

function showDeleteButton() {
  return ['definitions', 'category', 'deploy'].includes(config.value.mode)
}

watch([() => page.value, () => pageSize.value], () => void fetchRows())
watch([() => route.path, () => alertKind.value], () => {
  filters.value = {}
  page.value = 1
  form.value = getDefaultForm()
  void fetchRows()
})

onMounted(() => {
  form.value = getDefaultForm()
  void fetchRows()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <component :is="config.icon" class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          {{ config.eyebrow }}
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{{ config.title }}</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ config.description }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchRows">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新
        </Button>
        <Button v-if="['management', 'import'].includes(config.mode)" variant="outline" :disabled="saving || rows.length === 0" @click="downloadCurrentPage">
          <Download class="h-4 w-4" />
          批量导出
        </Button>
        <Button v-if="canWrite" @click="openDialog()">
          <Plus class="h-4 w-4" />
          新增
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <StatCard v-for="card in summaryCards" :key="card.title" :title="card.title" :value="card.value" />
    </div>

    <Panel v-if="config.mode === 'monitor'" title="七日趋势">
      <template #icon><Monitor class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-7">
        <div v-for="item in processTrend" :key="String(item.date)" class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <div class="text-xs text-slate-500">{{ item.date }}</div>
          <div class="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{{ item.started || 0 }}</div>
          <div class="text-xs text-slate-500">完成 {{ item.completed || 0 }} / 异常 {{ item.anomaly || 0 }}</div>
        </div>
      </div>
    </Panel>

    <Panel v-if="config.mode === 'import'" title="导入流程包">
      <template #icon><Upload class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="rounded-xl border border-dashed border-teal-300 bg-teal-50/60 p-4 dark:border-teal-800 dark:bg-teal-950/20">
          <input type="file" multiple accept=".json,application/json" class="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:text-slate-300" @change="onFileChange" />
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <div class="w-40">
              <Select v-model="conflictStrategy" :options="[{ value: 'skip', label: '跳过冲突' }, { value: 'rename', label: '重命名' }, { value: 'overwrite', label: '覆盖' }]" />
            </div>
            <Button variant="outline" :disabled="saving" @click="validateSelectedFiles"><FileCheck2 class="h-4 w-4" />校验</Button>
            <Button :disabled="saving" @click="importSelectedFiles"><Upload class="h-4 w-4" />导入</Button>
          </div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/80">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">导入结果</div>
          <div class="mt-2 text-sm text-slate-500">
            <template v-if="validationResult">
              {{ validationResult.workflowName || '流程包' }}：{{ validationResult.valid ? '校验通过' : '校验未通过' }}
              <div v-if="validationResult.errors?.length" class="mt-1 text-red-500">{{ validationResult.errors.join('；') }}</div>
            </template>
            <template v-else-if="importResults.length">
              <div v-for="item in importResults" :key="`${item.workflowName}-${item.action}`">
                {{ item.workflowName || '-' }}：{{ item.message || item.action }}
              </div>
            </template>
            <template v-else>等待选择 JSON 文件</template>
          </div>
        </div>
      </div>
    </Panel>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div v-if="isAlertPage" class="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
        <button type="button" class="rounded-lg px-3 py-1.5 text-sm" :class="alertKind === 'timeout' ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'" @click="alertKind = 'timeout'">超时告警</button>
        <button type="button" class="rounded-lg px-3 py-1.5 text-sm" :class="alertKind === 'anomaly' ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'" @click="alertKind = 'anomaly'">异常告警</button>
      </div>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
        <template v-for="field in filterFields" :key="field.key">
          <label v-if="field.type === 'select'" class="space-y-2">
            <span class="text-sm font-medium">{{ field.label }}</span>
            <Select v-model="filters[field.key]" :options="field.options || []" />
          </label>
          <Input v-else :model-value="toInputModelValue(filters[field.key])" :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'" :label="field.label" :placeholder="field.placeholder || config.searchPlaceholder" @update:model-value="filters[field.key] = $event" @enter="searchRows" />
        </template>
        <div class="flex items-end gap-2">
          <Button @click="searchRows"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel :title="`${config.title}列表`">
      <template #icon><component :is="config.icon" class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="rows" :loading="loading" :row-key="config.idKey">
        <template v-for="column in columns" #[`cell-${column.key}`]="{ row, value }" :key="column.key">
          <template v-if="column.key === config.idKey">
            <span class="font-mono text-xs text-slate-500">#{{ value }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <div class="flex flex-wrap justify-end gap-1">
              <Button v-if="config.mode === 'definitions' && row.status !== 'PUBLISHED'" size="sm" variant="success" @click="deployRow(row)"><Send class="h-3.5 w-3.5" />发布</Button>
              <Button v-if="['management', 'import', 'definitions'].includes(config.mode)" size="icon" variant="ghost" @click="downloadRow(row)"><Download class="h-4 w-4" /></Button>
              <Button v-if="config.mode === 'management'" size="sm" variant="warning" @click="safetyCheck(row)"><ShieldCheck class="h-3.5 w-3.5" />检查</Button>
              <Button v-if="config.mode === 'management'" size="sm" variant="danger" @click="archiveRow(row)"><Archive class="h-3.5 w-3.5" />归档</Button>
              <Button v-if="config.mode === 'archived' && row.canRestore" size="sm" variant="success" @click="restoreRow(row)">恢复</Button>
              <Button v-if="config.mode === 'archived'" size="sm" variant="danger" @click="permanentDeleteRow(row)">永久删除</Button>
              <Button v-if="config.mode === 'deploy'" size="sm" variant="outline" @click="toggleDeployRow(row)">{{ row.isEnabled ? '停用' : '启用' }}</Button>
              <Button v-if="config.mode === 'alerts' && alertKind === 'timeout' && !isResolved(row.resolved)" size="sm" variant="outline" @click="handleAlertRow(row, 'notify')">通知</Button>
              <Button v-if="config.mode === 'alerts' && alertKind === 'timeout' && !isResolved(row.resolved)" size="sm" variant="warning" @click="handleAlertRow(row, 'escalate')">升级</Button>
              <Button v-if="config.mode === 'alerts' && !isResolved(row.resolved)" size="sm" variant="success" @click="handleAlertRow(row, 'resolve')">解决</Button>
              <Button v-if="canWrite" size="icon" variant="ghost" @click="openDialog(row)">
                <Edit3 class="h-4 w-4" />
              </Button>
              <Button v-if="showDeleteButton()" size="icon" variant="ghost" @click="pendingDelete = row">
                <Trash2 class="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </template>
          <template v-else-if="fieldByKey(column.key)?.status">
            <StatusBadge :label="formatCell(fieldByKey(column.key), value, row)" :tone="statusTone(value)" />
          </template>
          <template v-else>
            <span :class="column.key === config.primaryKey ? 'font-semibold text-slate-900 dark:text-slate-100' : ''">
              {{ formatCell(fieldByKey(column.key), value, row) }}
            </span>
          </template>
        </template>
      </DataTable>
      <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </Panel>

    <BaseDialog :show="dialogOpen" :title="dialogTitle" width="wide" @close="closeDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <template v-for="field in formFields" :key="field.key">
          <label v-if="field.type === 'select'" class="space-y-2" :class="field.widthClass">
            <span class="text-sm font-medium">
              {{ field.label }}
              <span v-if="field.required" class="text-red-500">*</span>
            </span>
            <Select v-model="form[field.key]" :options="(field.options || []).filter((item) => item.value !== '')" />
          </label>
          <TextArea v-else-if="field.type === 'textarea'" :model-value="String(form[field.key] ?? '')" :label="field.label" :required="field.required" :class="field.widthClass || 'md:col-span-2'" :rows="field.key.endsWith('Json') || field.key.endsWith('Schema') ? 8 : 4" @update:model-value="updateFormValue(field.key, $event)" />
          <Input v-else :model-value="toInputModelValue(form[field.key])" :type="field.type || 'text'" :label="field.label" :required="field.required" :placeholder="field.placeholder" :class="field.widthClass" @update:model-value="form[field.key] = $event" />
        </template>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeDialog">取消</Button>
          <Button :disabled="saving" @click="saveRow"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(pendingDelete)"
      title="删除记录"
      :message="pendingDelete ? `确认删除“${pendingDelete[config.primaryKey] || pendingDelete[config.idKey]}”？` : ''"
      confirm-text="删除"
      danger
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />

    <ConfirmDialog
      :show="Boolean(pendingAction)"
      title="确认操作"
      :message="pendingAction?.message || ''"
      :confirm-text="pendingAction?.label || '确认'"
      :danger="pendingAction?.label === '永久删除' || pendingAction?.label === '归档'"
      @cancel="pendingAction = null"
      @confirm="confirmAction"
    />
  </div>
</template>
