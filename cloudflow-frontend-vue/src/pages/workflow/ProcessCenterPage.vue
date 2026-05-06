<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Eye,
  FileText,
  GitMerge,
  Inbox,
  MailOpen,
  PlayCircle,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Tags,
  Undo2
} from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  DataTable,
  EmptyState,
  Input,
  Pagination,
  Panel,
  Select,
  StatusBadge,
  TextArea,
  type Column,
  type SelectOption
} from '@/components/common'
import {
  batchMarkCopyAsRead,
  completeTask,
  createWorkflowFromTemplate,
  getCopyUnreadCount,
  getFormDefinition,
  getMyCopyList,
  getMyInstances,
  getProcessDefinitions,
  getProcessInstance,
  getProcessTrace,
  getTaskCounts,
  getTodoTasks,
  getWorkflowTemplate,
  getWorkflowTemplateCategories,
  getWorkflowTemplateTags,
  getWorkflowTemplates,
  getWorkflowTotal,
  markCopyAsRead,
  normalizeWorkflowRows,
  readWorkflowTask,
  recallProcess,
  startProcess,
  urgeWorkflowTask,
  type ProcessDefinitionSummary,
  type WorkflowRecord
} from '@/services/api/workflow'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'

type CenterMode = 'start' | 'applications' | 'todo' | 'copies' | 'templates'

const PAGE_SIZE = 12
const DEFAULT_TAGS = ['行政办公', '人事', '财务', '采购', '合同', '运维']

const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const auth = useAuthStore()

const mode = computed<CenterMode>(() => {
  if (route.path === '/my-apps') return 'applications'
  if (route.path === '/tasks') return 'todo'
  if (route.path === '/my-copies') return 'copies'
  if (route.path === '/templates') return 'templates'
  return 'start'
})

const pageMeta = computed(() => {
  const map: Record<CenterMode, { title: string; eyebrow: string; desc: string }> = {
    start: { title: '发起流程', eyebrow: 'Process Launch', desc: '选择已发布流程，填写业务数据并提交审批' },
    applications: { title: '我的申请', eyebrow: 'My Applications', desc: '跟踪本人发起的流程进度、当前节点和处理结果' },
    todo: { title: '审批待办', eyebrow: 'Approval Inbox', desc: '集中处理待审批任务，支持同意、驳回、催办和查看流转' },
    copies: { title: '抄送我的', eyebrow: 'Copied To Me', desc: '查看流程抄送记录，快速标记已读并追踪业务内容' },
    templates: { title: '模板库', eyebrow: 'Template Library', desc: '浏览流程模板，预览节点结构并从模板创建流程定义' }
  }
  return map[mode.value]
})

const loading = ref(false)
const saving = ref(false)
const definitions = ref<ProcessDefinitionSummary[]>([])
const rows = ref<WorkflowRecord[]>([])
const templates = ref<WorkflowRecord[]>([])
const categories = ref<WorkflowRecord[]>([])
const recommendedTags = ref<string[]>(DEFAULT_TAGS)
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(PAGE_SIZE)
const unreadCopies = ref(0)
const taskCounts = ref<WorkflowRecord>({})
const selectedCopyIds = ref<Array<string | number>>([])

const filters = ref({
  keyword: '',
  status: '',
  processDefKey: '',
  priority: '',
  isRead: '',
  categoryId: '',
  tags: ''
})

const launchOpen = ref(false)
const handleOpen = ref(false)
const detailOpen = ref(false)
const templateOpen = ref(false)
const templateCreateOpen = ref(false)
const selectedDefinition = ref<ProcessDefinitionSummary | null>(null)
const selectedRow = ref<WorkflowRecord | null>(null)
const selectedTemplate = ref<WorkflowRecord | null>(null)
const traceData = ref<WorkflowRecord | null>(null)
const formSchema = ref<Array<Record<string, unknown>>>([])
const formData = ref<Record<string, string>>({})
const actionForm = ref({ action: 'APPROVE', comment: '', delegateUserId: '', urgeReason: '' })
const templateForm = ref({ workflowName: '', description: '' })

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'RUNNING', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'REVOKED', label: '已撤回' },
  { value: 'CANCELLED', label: '已取消' }
]

const priorityOptions: SelectOption[] = [
  { value: '', label: '全部优先级' },
  { value: 'URGENT', label: '紧急' },
  { value: 'HIGH', label: '高' },
  { value: 'NORMAL', label: '普通' },
  { value: 'LOW', label: '低' }
]

const readOptions: SelectOption[] = [
  { value: '', label: '全部' },
  { value: '0', label: '未读' },
  { value: '1', label: '已读' }
]

const actionOptions: SelectOption[] = [
  { value: 'APPROVE', label: '同意' },
  { value: 'REJECT', label: '驳回' },
  { value: 'RETURN', label: '退回' },
  { value: 'DELEGATE', label: '转办' }
]

const definitionOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部流程' },
  ...definitions.value.map((item) => ({
    value: String(item.processKey || ''),
    label: String(item.processName || item.processKey || '未命名流程')
  })).filter((item) => item.value)
])

const categoryOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部分类' },
  ...flattenCategories(categories.value).map((item) => ({
    value: String(idOf(item)),
    label: String(item.name || item.categoryName || item.label || idOf(item))
  }))
])

const activeRows = computed(() => mode.value === 'templates' ? templates.value : rows.value)
const publishedDefinitions = computed(() => {
  const latest = new Map<string, ProcessDefinitionSummary>()
  definitions.value.forEach((item) => {
    const key = String(item.processKey || '').trim()
    if (!key) return
    const status = String(item.status || '').toUpperCase()
    if (status && status !== 'PUBLISHED') return
    const current = latest.get(key)
    if (!current || Number(item.version || 0) >= Number(current.version || 0)) latest.set(key, item)
  })
  return Array.from(latest.values())
})

const stats = computed(() => [
  { label: '可发起流程', value: publishedDefinitions.value.length },
  { label: '待办任务', value: Number(taskCounts.value.todoCount ?? taskCounts.value.pendingCount ?? rows.value.filter((row) => String(row.status) === 'TODO').length) },
  { label: '我的申请', value: Number(taskCounts.value.myInstanceCount ?? taskCounts.value.applicationCount ?? 0) },
  { label: '未读抄送', value: unreadCopies.value }
])

const tableColumns = computed<Column<WorkflowRecord>[]>(() => {
  if (mode.value === 'templates') {
    return [
      { key: 'name', label: '模板' },
      { key: 'categoryName', label: '分类' },
      { key: 'usageCount', label: '使用次数' },
      { key: 'status', label: '状态' },
      { key: 'updatedAt', label: '更新时间' },
      { key: 'actions', label: '操作' }
    ]
  }
  if (mode.value === 'copies') {
    return [
      { key: 'title', label: '流程标题' },
      { key: 'processName', label: '流程' },
      { key: 'nodeName', label: '抄送节点' },
      { key: 'startUserName', label: '发起人' },
      { key: 'isRead', label: '状态' },
      { key: 'createTime', label: '抄送时间' },
      { key: 'actions', label: '操作' }
    ]
  }
  if (mode.value === 'applications') {
    return [
      { key: 'title', label: '申请标题' },
      { key: 'processDefKey', label: '流程Key' },
      { key: 'status', label: '状态' },
      { key: 'currentNodeName', label: '当前节点' },
      { key: 'assigneeName', label: '处理人' },
      { key: 'startTime', label: '发起时间' },
      { key: 'actions', label: '操作' }
    ]
  }
  return [
    { key: 'instanceTitle', label: '任务' },
    { key: 'processName', label: '流程' },
    { key: 'nodeName', label: '节点' },
    { key: 'startUserName', label: '发起人' },
    { key: 'priority', label: '优先级' },
    { key: 'dueTime', label: '截止时间' },
    { key: 'actions', label: '操作' }
  ]
})

function rowText(row: WorkflowRecord | null | undefined, key: string, fallback = '-') {
  const value = row?.[key]
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

function idOf(row: WorkflowRecord | null | undefined) {
  return row?.id ?? row?.templateId ?? row?.categoryId ?? row?.definitionId ?? row?.instanceId ?? row?.taskId ?? row?.copyId
}

function stringIdOf(row: WorkflowRecord | null | undefined) {
  const id = idOf(row)
  if (typeof id === 'string' || typeof id === 'number') return String(id)
  return ''
}

function statusLabel(value: unknown) {
  const status = String(value || '').toUpperCase()
  const map: Record<string, string> = {
    PUBLISHED: '已发布',
    DRAFT: '草稿',
    ACTIVE: '启用',
    RUNNING: '进行中',
    COMPLETED: '已完成',
    REJECTED: '已拒绝',
    REVOKED: '已撤回',
    CANCELLED: '已取消',
    TODO: '待处理',
    DONE: '已完成',
    ARCHIVED: '已归档'
  }
  return map[status] || String(value || '-')
}

function statusTone(value: unknown) {
  const status = String(value || '').toUpperCase()
  if (['COMPLETED', 'DONE', 'PUBLISHED', 'ACTIVE'].includes(status)) return 'green'
  if (['REJECTED', 'CANCELLED', 'FAILED'].includes(status)) return 'red'
  if (['RUNNING', 'TODO', 'DRAFT'].includes(status)) return 'yellow'
  return 'slate'
}

function priorityLabel(value: unknown) {
  const map: Record<string, string> = { URGENT: '紧急', HIGH: '高', NORMAL: '普通', LOW: '低' }
  return map[String(value || '').toUpperCase()] || String(value || '普通')
}

function excerpt(value: unknown, length = 80) {
  const text = String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, length) : '暂无说明'
}

function formatTime(value: unknown) {
  const text = String(value || '')
  return text ? text.replace('T', ' ').slice(0, 19) : '-'
}

function parseJson(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, unknown>
  try {
    return JSON.parse(String(value)) as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseArrayJson(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
  if (!value || typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>> : []
  } catch {
    return []
  }
}

function flattenCategories(items: WorkflowRecord[], level = 0): WorkflowRecord[] {
  return items.flatMap((item) => {
    const prefix = level > 0 ? `${'　'.repeat(level)}└ ` : ''
    const current = { ...item, name: `${prefix}${String(item.name || item.categoryName || item.label || idOf(item))}` }
    const children = Array.isArray(item.children) ? flattenCategories(item.children as WorkflowRecord[], level + 1) : []
    return [current, ...children]
  })
}

function tagList(row: WorkflowRecord | null | undefined) {
  const tags = row?.tags
  if (Array.isArray(tags)) return tags.map(String)
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags) as unknown
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      return tags.split(',').map((item) => item.trim()).filter(Boolean)
    }
  }
  return []
}

function resetFilters() {
  filters.value = { keyword: '', status: '', processDefKey: '', priority: '', isRead: '', categoryId: '', tags: '' }
  pageNum.value = 1
  void fetchRows()
}

function searchRows() {
  pageNum.value = 1
  void fetchRows()
}

async function fetchDefinitions() {
  const data = await getProcessDefinitions({ latestOnly: false, pageSize: 200 })
  definitions.value = normalizeWorkflowRows<ProcessDefinitionSummary>(data)
}

async function fetchCounts() {
  try {
    taskCounts.value = await getTaskCounts()
  } catch {
    taskCounts.value = {}
  }
  try {
    unreadCopies.value = await getCopyUnreadCount()
  } catch {
    unreadCopies.value = 0
  }
}

function buildCommonParams() {
  return {
    pageNum: pageNum.value,
    pageSize: pageSize.value,
    keyword: filters.value.keyword || undefined,
    status: filters.value.status || undefined,
    processDefKey: filters.value.processDefKey || undefined,
    priority: filters.value.priority || undefined
  }
}

async function fetchRows() {
  loading.value = true
  try {
    if (mode.value === 'start') {
      rows.value = publishedDefinitions.value as WorkflowRecord[]
      total.value = rows.value.length
      return
    }
    if (mode.value === 'applications') {
      const data = await getMyInstances(buildCommonParams())
      rows.value = normalizeWorkflowRows(data)
      total.value = getWorkflowTotal(data, rows.value.length)
      return
    }
    if (mode.value === 'todo') {
      const data = await getTodoTasks(buildCommonParams())
      rows.value = normalizeWorkflowRows(data)
      total.value = getWorkflowTotal(data, rows.value.length)
      return
    }
    if (mode.value === 'copies') {
      const data = await getMyCopyList({
        pageNum: pageNum.value,
        pageSize: pageSize.value,
        keyword: filters.value.keyword || undefined,
        isRead: filters.value.isRead === '' ? undefined : Number(filters.value.isRead),
        processDefKey: filters.value.processDefKey || undefined
      })
      rows.value = normalizeWorkflowRows(data)
      total.value = getWorkflowTotal(data, rows.value.length)
      return
    }
    const data = await getWorkflowTemplates({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: filters.value.keyword || undefined,
      categoryId: filters.value.categoryId || undefined,
      tags: filters.value.tags || undefined,
      status: filters.value.status || undefined
    })
    templates.value = normalizeWorkflowRows(data)
    total.value = getWorkflowTotal(data, templates.value.length)
  } catch (error) {
    rows.value = []
    templates.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '流程中心数据加载失败'))
  } finally {
    loading.value = false
  }
}

async function fetchTemplateMeta() {
  try {
    categories.value = await getWorkflowTemplateCategories()
  } catch {
    categories.value = []
  }
  try {
    const tags = await getWorkflowTemplateTags(12)
    recommendedTags.value = tags.length ? tags : DEFAULT_TAGS
  } catch {
    recommendedTags.value = DEFAULT_TAGS
  }
}

function initFormFromSchema(fields: Array<Record<string, unknown>>) {
  formData.value = {}
  fields.forEach((field) => {
    const key = String(field.id || field.key || field.name || '')
    if (key) formData.value[key] = String(field.defaultValue ?? '')
  })
}

async function openLaunch(definition: ProcessDefinitionSummary) {
  selectedDefinition.value = definition
  formSchema.value = []
  initFormFromSchema([])
  launchOpen.value = true
  if (!definition.formId) return
  try {
    const form = await getFormDefinition(String(definition.formId))
    const raw = form.fieldsJson || form.formSchema
    formSchema.value = parseArrayJson(raw)
    initFormFromSchema(formSchema.value)
  } catch (error) {
    toast.error(getErrorMessage(error, '绑定表单加载失败'))
  }
}

async function submitLaunch() {
  if (!selectedDefinition.value?.processKey) return
  saving.value = true
  try {
    await startProcess({
      processDefKey: selectedDefinition.value.processKey,
      businessKey: `BK_${Date.now()}`,
      title: `${selectedDefinition.value.processName || selectedDefinition.value.processKey} - ${auth.user?.name || auth.user?.username || '当前用户'}`,
      variables: { ...formData.value }
    })
    launchOpen.value = false
    toast.success('流程已发起')
    await router.push('/my-apps')
  } catch (error) {
    toast.error(getErrorMessage(error, '发起流程失败'))
  } finally {
    saving.value = false
  }
}

async function openHandle(row: WorkflowRecord) {
  selectedRow.value = row
  actionForm.value = { action: 'APPROVE', comment: '', delegateUserId: '', urgeReason: '' }
  handleOpen.value = true
  const taskId = row.taskId
  if (taskId) {
    try {
      await readWorkflowTask(String(taskId))
    } catch {
      // read marker is non-blocking
    }
  }
}

async function submitHandle() {
  if (!selectedRow.value?.taskId) return
  saving.value = true
  try {
    await completeTask({
      taskId: selectedRow.value.taskId,
      action: actionForm.value.action,
      comment: actionForm.value.comment,
      delegateUserId: actionForm.value.delegateUserId || undefined,
      variables: {}
    })
    handleOpen.value = false
    toast.success('任务已处理')
    await fetchRows()
    await fetchCounts()
  } catch (error) {
    toast.error(getErrorMessage(error, '处理任务失败'))
  } finally {
    saving.value = false
  }
}

async function urge(row: WorkflowRecord) {
  if (!row.taskId) return
  saving.value = true
  try {
    await urgeWorkflowTask(String(row.taskId), actionForm.value.urgeReason || '请尽快处理该流程')
    toast.success('已发送催办')
  } catch (error) {
    toast.error(getErrorMessage(error, '催办失败'))
  } finally {
    saving.value = false
  }
}

async function recall(row: WorkflowRecord) {
  if (!row.instanceId) return
  saving.value = true
  try {
    await recallProcess(String(row.instanceId))
    toast.success('流程已撤回')
    await fetchRows()
    await fetchCounts()
  } catch (error) {
    toast.error(getErrorMessage(error, '撤回失败'))
  } finally {
    saving.value = false
  }
}

async function openDetail(row: WorkflowRecord) {
  selectedRow.value = row
  traceData.value = null
  detailOpen.value = true
  const instanceId = row.instanceId
  if (!instanceId) return
  try {
    const [detail, trace] = await Promise.allSettled([
      getProcessInstance(String(instanceId)),
      getProcessTrace(String(instanceId))
    ])
    if (detail.status === 'fulfilled') selectedRow.value = { ...row, ...detail.value }
    if (trace.status === 'fulfilled') traceData.value = trace.value
  } catch {
    // Promise.allSettled handles errors
  }
}

async function openCopy(row: WorkflowRecord) {
  await openDetail(row)
  const id = idOf(row)
  if (id && Number(row.isRead) !== 1) {
    try {
      await markCopyAsRead(String(id))
      await fetchRows()
      await fetchCounts()
    } catch {
      // read marker is non-blocking
    }
  }
}

function toggleCopySelection(row: WorkflowRecord) {
  const id = stringIdOf(row)
  if (!id) return
  selectedCopyIds.value = selectedCopyIds.value.includes(id)
    ? selectedCopyIds.value.filter((item) => item !== id)
    : [...selectedCopyIds.value, id]
}

async function markSelectedCopiesRead() {
  if (selectedCopyIds.value.length === 0) {
    toast.error('请先选择未读抄送')
    return
  }
  saving.value = true
  try {
    await batchMarkCopyAsRead(selectedCopyIds.value)
    selectedCopyIds.value = []
    toast.success('已批量标记已读')
    await fetchRows()
    await fetchCounts()
  } catch (error) {
    toast.error(getErrorMessage(error, '批量标记失败'))
  } finally {
    saving.value = false
  }
}

async function previewTemplate(row: WorkflowRecord) {
  selectedTemplate.value = row
  templateOpen.value = true
  const id = idOf(row)
  if (!id) return
  try {
    selectedTemplate.value = await getWorkflowTemplate(String(id))
  } catch {
    selectedTemplate.value = row
  }
}

function openTemplateCreate(row: WorkflowRecord) {
  selectedTemplate.value = row
  templateForm.value = {
    workflowName: `${String(row.name || '新流程')}`,
    description: String(row.description || '')
  }
  templateCreateOpen.value = true
}

async function submitTemplateCreate() {
  const id = idOf(selectedTemplate.value)
  if (!id || !templateForm.value.workflowName.trim()) {
    toast.error('请填写流程名称')
    return
  }
  saving.value = true
  try {
    await createWorkflowFromTemplate(String(id), {
      workflowName: templateForm.value.workflowName.trim(),
      description: templateForm.value.description.trim()
    })
    templateCreateOpen.value = false
    toast.success('已从模板创建流程')
    await router.push('/workflow/management')
  } catch (error) {
    toast.error(getErrorMessage(error, '从模板创建流程失败'))
  } finally {
    saving.value = false
  }
}

function fieldLabel(field: Record<string, unknown>) {
  return String(field.label || field.name || field.id || field.key || '字段')
}

function fieldKey(field: Record<string, unknown>) {
  return String(field.id || field.key || field.name || '')
}

function fieldType(field: Record<string, unknown>) {
  const type = String(field.type || 'TEXT').toUpperCase()
  if (type.includes('DATE')) return 'date'
  if (type.includes('NUMBER')) return 'number'
  return 'text'
}

function fieldOptions(field: Record<string, unknown>): SelectOption[] {
  const options = field.options
  if (Array.isArray(options)) return options.map((item) => typeof item === 'object' && item !== null
    ? { value: String((item as Record<string, unknown>).value ?? (item as Record<string, unknown>).label ?? ''), label: String((item as Record<string, unknown>).label ?? (item as Record<string, unknown>).value ?? '') }
    : { value: String(item), label: String(item) })
  return []
}

function refreshAll() {
  void Promise.all([fetchDefinitions(), fetchCounts(), mode.value === 'templates' ? fetchTemplateMeta() : Promise.resolve()])
    .finally(() => void fetchRows())
}

watch(mode, () => {
  pageNum.value = 1
  selectedCopyIds.value = []
  filters.value = { keyword: '', status: '', processDefKey: '', priority: '', isRead: '', categoryId: '', tags: '' }
  refreshAll()
})

watch([pageNum, pageSize], () => void fetchRows())

onMounted(async () => {
  await Promise.all([fetchDefinitions(), fetchCounts(), fetchTemplateMeta()])
  await fetchRows()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <GitMerge class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          {{ pageMeta.eyebrow }}
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{{ pageMeta.title }}</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ pageMeta.desc }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="refreshAll">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新
        </Button>
        <Button v-if="mode !== 'start'" @click="router.push('/workplace')"><PlayCircle class="h-4 w-4" />发起流程</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div v-for="item in stats" :key="item.label" class="card p-4">
        <div class="text-xs text-slate-500 dark:text-slate-400">{{ item.label }}</div>
        <div class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ formatNumber(item.value) }}</div>
      </div>
    </div>

    <Panel v-if="mode === 'start'" title="可发起流程">
      <template #icon><PlayCircle class="h-4 w-4 text-slate-500" /></template>
      <div class="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <Input v-model="filters.keyword" label="搜索" placeholder="流程名称/流程Key" @enter="searchRows" />
        <label class="space-y-1.5">
          <span class="text-sm font-medium">分类</span>
          <Select v-model="filters.status" :options="[{ value: '', label: '全部' }, { value: 'PUBLISHED', label: '已发布' }]" />
        </label>
        <div class="flex items-end gap-2"><Button @click="searchRows"><Search class="h-4 w-4" />查询</Button><Button variant="outline" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button></div>
      </div>
      <div v-if="publishedDefinitions.length" class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <button v-for="row in publishedDefinitions.filter((item) => !filters.keyword || `${item.processName || ''}${item.processKey || ''}`.toLowerCase().includes(filters.keyword.toLowerCase()))" :key="String(row.definitionId)" class="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/70" @click="openLaunch(row)">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{{ row.processName || row.processKey }}</span>
                <StatusBadge :label="`v${row.version || 1}`" tone="cyan" />
              </div>
              <p class="mt-2 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{{ excerpt(row.description, 90) }}</p>
            </div>
            <ArrowRight class="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-600" />
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span class="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">{{ row.processKey }}</span>
            <span v-if="row.category" class="rounded-md bg-teal-50 px-2 py-1 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">{{ row.category }}</span>
          </div>
        </button>
      </div>
      <EmptyState v-else title="暂无可发起流程" description="流程管理发布后会显示在这里" />
    </Panel>

    <Panel v-else :title="pageMeta.title">
      <template #icon>
        <FileText v-if="mode === 'applications'" class="h-4 w-4 text-slate-500" />
        <CheckCircle2 v-else-if="mode === 'todo'" class="h-4 w-4 text-slate-500" />
        <MailOpen v-else-if="mode === 'copies'" class="h-4 w-4 text-slate-500" />
        <Sparkles v-else class="h-4 w-4 text-slate-500" />
      </template>
      <template #actions>
        <Button v-if="mode === 'copies'" variant="outline" :disabled="saving || selectedCopyIds.length === 0" @click="markSelectedCopiesRead"><MailOpen class="h-4 w-4" />批量已读</Button>
      </template>

      <div class="mb-4 grid gap-3 xl:grid-cols-[1fr_180px_180px_180px_auto]">
        <Input v-model="filters.keyword" label="关键词" placeholder="标题/流程/发起人" @enter="searchRows" />
        <label v-if="mode !== 'templates'" class="space-y-1.5"><span class="text-sm font-medium">流程类型</span><Select v-model="filters.processDefKey" :options="definitionOptions" searchable /></label>
        <label v-if="mode === 'applications'" class="space-y-1.5"><span class="text-sm font-medium">状态</span><Select v-model="filters.status" :options="statusOptions" /></label>
        <label v-if="mode === 'todo'" class="space-y-1.5"><span class="text-sm font-medium">优先级</span><Select v-model="filters.priority" :options="priorityOptions" /></label>
        <label v-if="mode === 'copies'" class="space-y-1.5"><span class="text-sm font-medium">阅读状态</span><Select v-model="filters.isRead" :options="readOptions" /></label>
        <label v-if="mode === 'templates'" class="space-y-1.5"><span class="text-sm font-medium">分类</span><Select v-model="filters.categoryId" :options="categoryOptions" searchable /></label>
        <label v-if="mode === 'templates'" class="space-y-1.5"><span class="text-sm font-medium">标签</span><Select v-model="filters.tags" :options="[{ value: '', label: '全部标签' }, ...recommendedTags.map((tag) => ({ value: tag, label: tag }))]" /></label>
        <div class="flex items-end gap-2"><Button @click="searchRows"><Search class="h-4 w-4" />查询</Button><Button variant="outline" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button></div>
      </div>

      <DataTable :columns="tableColumns" :data="activeRows" :loading="loading" row-key="id">
        <template #cell-title="{ row }">
          <div class="max-w-[360px]">
            <div class="truncate font-medium text-slate-900 dark:text-slate-100">{{ rowText(row, 'title', rowText(row, 'name')) }}</div>
            <div class="mt-1 truncate text-xs text-slate-500">{{ rowText(row, 'processNo', rowText(row, 'instanceId')) }}</div>
          </div>
        </template>
        <template #cell-instanceTitle="{ row }">
          <div class="max-w-[360px]">
            <div class="truncate font-medium text-slate-900 dark:text-slate-100">{{ rowText(row, 'instanceTitle', rowText(row, 'nodeName')) }}</div>
            <div class="mt-1 truncate text-xs text-slate-500">{{ rowText(row, 'instanceId') }}</div>
          </div>
        </template>
        <template #cell-name="{ row }">
          <div class="max-w-[360px]">
            <div class="truncate font-medium text-slate-900 dark:text-slate-100">{{ rowText(row, 'name') }}</div>
            <div class="mt-1 truncate text-xs text-slate-500">{{ excerpt(row.description, 70) }}</div>
            <div v-if="tagList(row).length" class="mt-2 flex flex-wrap gap-1">
              <span v-for="tag in tagList(row).slice(0, 3)" :key="tag" class="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">{{ tag }}</span>
            </div>
          </div>
        </template>
        <template #cell-status="{ row, value }"><StatusBadge :label="statusLabel(value || row.status)" :tone="statusTone(value || row.status)" /></template>
        <template #cell-priority="{ value }"><StatusBadge :label="priorityLabel(value)" :tone="String(value).toUpperCase() === 'URGENT' ? 'red' : String(value).toUpperCase() === 'HIGH' ? 'yellow' : 'slate'" /></template>
        <template #cell-isRead="{ row }"><StatusBadge :label="Number(row.isRead) === 1 ? '已读' : '未读'" :tone="Number(row.isRead) === 1 ? 'slate' : 'yellow'" /></template>
        <template #cell-createTime="{ value }">{{ formatTime(value) }}</template>
        <template #cell-startTime="{ value }">{{ formatTime(value) }}</template>
        <template #cell-dueTime="{ value }">{{ formatTime(value) }}</template>
        <template #cell-updatedAt="{ value }">{{ formatTime(value) }}</template>
        <template #cell-usageCount="{ value }">{{ formatNumber(Number(value || 0)) }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button v-if="mode === 'todo'" size="sm" @click="openHandle(row)">处理</Button>
            <Button v-if="mode === 'todo'" size="icon" variant="ghost" @click="urge(row)"><BellRing class="h-4 w-4" /></Button>
            <Button v-if="mode === 'applications' && String(row.status) === 'RUNNING'" size="icon" variant="ghost" @click="recall(row)"><Undo2 class="h-4 w-4" /></Button>
            <Button v-if="mode === 'copies' && Number(row.isRead) !== 1" size="icon" variant="ghost" @click="toggleCopySelection(row)"><Inbox class="h-4 w-4" :class="selectedCopyIds.includes(stringIdOf(row)) ? 'text-teal-600' : ''" /></Button>
            <Button v-if="mode === 'templates'" size="sm" variant="outline" @click="previewTemplate(row)">预览</Button>
            <Button v-if="mode === 'templates'" size="sm" @click="openTemplateCreate(row)">使用</Button>
            <Button v-if="mode !== 'templates' && mode !== 'copies'" size="icon" variant="ghost" @click="openDetail(row)"><Eye class="h-4 w-4" /></Button>
            <Button v-if="mode === 'copies'" size="icon" variant="ghost" @click="openCopy(row)"><Eye class="h-4 w-4" /></Button>
          </div>
        </template>
      </DataTable>
      <Pagination v-if="total > 0" v-model:page="pageNum" v-model:page-size="pageSize" :total="total" />
    </Panel>

    <BaseDialog :show="launchOpen" :title="selectedDefinition ? `发起：${selectedDefinition.processName || selectedDefinition.processKey}` : '发起流程'" width="wide" @close="launchOpen = false">
      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <div class="font-medium text-slate-900 dark:text-slate-100">{{ selectedDefinition?.processName || selectedDefinition?.processKey }}</div>
          <div class="mt-1 text-sm text-slate-500">{{ selectedDefinition?.description || '该流程没有说明' }}</div>
        </div>
        <div v-if="formSchema.length" class="grid gap-4 md:grid-cols-2">
          <template v-for="field in formSchema" :key="fieldKey(field)">
            <label v-if="fieldOptions(field).length" class="space-y-2">
              <span class="text-sm font-medium">{{ fieldLabel(field) }}</span>
              <Select v-model="formData[fieldKey(field)]" :options="fieldOptions(field)" />
            </label>
            <TextArea v-else-if="String(field.type || '').toUpperCase().includes('TEXTAREA')" v-model="formData[fieldKey(field)]" :label="fieldLabel(field)" class="md:col-span-2" />
            <Input v-else v-model="formData[fieldKey(field)]" :type="fieldType(field)" :label="fieldLabel(field)" />
          </template>
        </div>
        <TextArea v-else v-model="formData.remark" label="申请说明" :rows="5" placeholder="填写本次流程的业务说明" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3"><Button variant="outline" @click="launchOpen = false">取消</Button><Button :disabled="saving" @click="submitLaunch"><Send class="h-4 w-4" />提交</Button></div>
      </template>
    </BaseDialog>

    <BaseDialog :show="handleOpen" :title="selectedRow ? `处理：${rowText(selectedRow, 'nodeName')}` : '处理任务'" width="wide" @close="handleOpen = false">
      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <div class="font-medium text-slate-900 dark:text-slate-100">{{ rowText(selectedRow, 'instanceTitle', rowText(selectedRow, 'processName')) }}</div>
          <div class="mt-1 text-sm text-slate-500">发起人 {{ rowText(selectedRow, 'startUserName') }} · 截止 {{ formatTime(selectedRow?.dueTime) }}</div>
        </div>
        <label class="space-y-2"><span class="text-sm font-medium">处理动作</span><Select v-model="actionForm.action" :options="actionOptions" /></label>
        <Input v-if="actionForm.action === 'DELEGATE'" v-model="actionForm.delegateUserId" label="转办用户ID" />
        <TextArea v-model="actionForm.comment" label="处理意见" :rows="5" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3"><Button variant="outline" @click="handleOpen = false">取消</Button><Button :disabled="saving" @click="submitHandle"><CheckCircle2 class="h-4 w-4" />提交处理</Button></div>
      </template>
    </BaseDialog>

    <BaseDialog :show="detailOpen" :title="selectedRow ? rowText(selectedRow, 'title', rowText(selectedRow, 'instanceTitle', '流程详情')) : '流程详情'" width="extra-wide" @close="detailOpen = false">
      <div v-if="selectedRow" class="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div class="space-y-4">
          <Panel title="基础信息">
            <div class="grid gap-3 text-sm md:grid-cols-2">
              <div>流程Key：{{ rowText(selectedRow, 'processDefKey') }}</div>
              <div>状态：<StatusBadge :label="statusLabel(selectedRow.status)" :tone="statusTone(selectedRow.status)" /></div>
              <div>发起人：{{ rowText(selectedRow, 'startUserName') }}</div>
              <div>发起时间：{{ formatTime(selectedRow.startTime || selectedRow.createTime) }}</div>
              <div>当前节点：{{ rowText(selectedRow, 'currentNodeName', rowText(selectedRow, 'nodeName')) }}</div>
              <div>当前处理人：{{ rowText(selectedRow, 'assigneeName') }}</div>
            </div>
          </Panel>
          <Panel title="表单数据">
            <div class="grid gap-2 text-sm">
              <div v-for="(value, key) in parseJson(selectedRow.variables || selectedRow.formData)" :key="key" class="flex justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
                <span class="text-slate-500">{{ key }}</span>
                <span class="text-right text-slate-900 dark:text-slate-100">{{ value }}</span>
              </div>
              <EmptyState v-if="Object.keys(parseJson(selectedRow.variables || selectedRow.formData)).length === 0" title="暂无表单数据" />
            </div>
          </Panel>
        </div>
        <Panel title="流程追踪">
          <div class="space-y-3">
            <div v-for="(step, index) in (Array.isArray(selectedRow.stepsDetail) ? selectedRow.stepsDetail : [])" :key="index" class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div class="font-medium text-slate-900 dark:text-slate-100">{{ rowText(step as WorkflowRecord, 'nodeName', `步骤 ${index + 1}`) }}</div>
              <div class="mt-1 text-xs text-slate-500">{{ rowText(step as WorkflowRecord, 'assigneeName', rowText(step as WorkflowRecord, 'operatorName')) }}</div>
            </div>
            <pre v-if="traceData" class="max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{{ traceData }}</pre>
            <EmptyState v-if="!traceData && !(Array.isArray(selectedRow.stepsDetail) && selectedRow.stepsDetail.length)" title="暂无流转记录" />
          </div>
        </Panel>
      </div>
    </BaseDialog>

    <BaseDialog :show="templateOpen" :title="selectedTemplate ? rowText(selectedTemplate, 'name', '模板预览') : '模板预览'" width="extra-wide" @close="templateOpen = false">
      <div v-if="selectedTemplate" class="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <pre class="max-h-[520px] overflow-auto text-xs leading-6 text-slate-700 dark:text-slate-200">{{ selectedTemplate.definition || '暂无模板定义' }}</pre>
        </div>
        <div class="space-y-4">
          <Panel title="模板信息">
            <div class="space-y-3 text-sm">
              <div>分类：{{ rowText(selectedTemplate, 'categoryName') }}</div>
              <div>使用次数：{{ formatNumber(Number(selectedTemplate.usageCount || 0)) }}</div>
              <div>创建者：{{ rowText(selectedTemplate, 'createdByName', rowText(selectedTemplate, 'createdBy')) }}</div>
              <div>更新时间：{{ formatTime(selectedTemplate.updatedAt) }}</div>
            </div>
          </Panel>
          <Panel title="标签">
            <div class="flex flex-wrap gap-2">
              <span v-for="tag in tagList(selectedTemplate)" :key="tag" class="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs text-teal-700 dark:bg-teal-950/40 dark:text-teal-200"><Tags class="h-3 w-3" />{{ tag }}</span>
              <span v-if="tagList(selectedTemplate).length === 0" class="text-sm text-slate-500">暂无标签</span>
            </div>
          </Panel>
        </div>
      </div>
    </BaseDialog>

    <BaseDialog :show="templateCreateOpen" title="从模板创建流程" width="wide" @close="templateCreateOpen = false">
      <div class="grid gap-4">
        <Input v-model="templateForm.workflowName" label="流程名称" required />
        <TextArea v-model="templateForm.description" label="流程说明" :rows="5" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3"><Button variant="outline" @click="templateCreateOpen = false">取消</Button><Button :disabled="saving" @click="submitTemplateCreate"><Sparkles class="h-4 w-4" />创建</Button></div>
      </template>
    </BaseDialog>
  </div>
</template>
