<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  GitMerge,
  Loader2,
  Maximize2,
  RefreshCcw,
  Redo2,
  Rocket,
  Save,
  Settings,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-vue-next'
import { Button, ConfirmDialog, Input, Select, TextArea, type SelectOption } from '@/components/common'
import {
  deployProcessDefinition,
  exportWorkflow,
  getFormDefinitions,
  getProcessDefinition,
  getProcessDefinitions,
  normalizeWorkflowRows,
  saveProcessDefinition,
  type FormDefinitionSummary,
  type ProcessDefinitionSummary
} from '@/services/api/workflow'
import {
  getDeptTree,
  getRoleOptions,
  getUserList,
  type RoleOption,
  type SysDept,
  type SysUser
} from '@/services/api/systemManage'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  appendWorkflowGraphBranch,
  assertWorkflowGraphIntegrity,
  countWorkflowGraphBranches,
  createDefaultWorkflowGraph,
  findWorkflowGraphNode,
  findWorkflowGraphParentNodeId,
  insertWorkflowGraphNodeAfter,
  isWorkflowGraphBranchRoot,
  isWorkflowGraphNodeInBranchSubtree,
  isWorkflowGraphNodeInsideBranchScope,
  moveWorkflowGraphNode,
  parseWorkflowGraphDefinition,
  patchWorkflowGraphNode,
  replaceWorkflowGraphNextNode,
  removeWorkflowGraphBranch,
  removeWorkflowGraphNode
} from '@/utils/workflowGraph'
import {
  NodeType,
  type WorkflowDefinition,
  type WorkflowGraphDefinition,
  type WorkflowGraphNode
} from '@/types'
import WorkflowFlowNode from './WorkflowFlowNode.vue'

type ConfirmState = {
  title: string
  message: string
  danger?: boolean
  run: () => void | Promise<void>
}

const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const loading = ref(false)
const saving = ref(false)
const workflows = ref<ProcessDefinitionSummary[]>([])
const availableForms = ref<FormDefinitionSummary[]>([])
const availableRoles = ref<RoleOption[]>([])
const availableUsers = ref<SysUser[]>([])
const availableDepts = ref<SysDept[]>([])
const workflow = ref<WorkflowDefinition | null>(null)
const graphModel = ref<WorkflowGraphDefinition>(createDefaultWorkflowGraph())
const selectedNodeId = ref<string | null>(null)
const activeQuickAddId = ref<string | null>(null)
const invalidNodeIds = ref<string[]>([])
const confirmState = ref<ConfirmState | null>(null)
const showGlobalConfig = ref(false)
const draggingNodeId = ref<string | null>(null)
const hoveredDropParentId = ref<string | null>(null)
const zoom = ref(1)
const panOrigin = ref({ x: 0, y: 0 })
const panStart = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const historyPast = ref<WorkflowGraphDefinition[]>([])
const historyFuture = ref<WorkflowGraphDefinition[]>([])

const workflowName = computed({
  get: () => workflow.value?.name || '',
  set: (value: string) => {
    if (workflow.value) workflow.value.name = value
  }
})

const workflowKey = computed({
  get: () => workflow.value?.key || '',
  set: (value: string) => {
    if (workflow.value) workflow.value.key = value
  }
})

const selectedNode = computed(() => selectedNodeId.value ? findWorkflowGraphNode(graphModel.value, selectedNodeId.value) : null)
const selectedNodeBranchCount = computed(() => selectedNodeId.value ? countWorkflowGraphBranches(graphModel.value, selectedNodeId.value) : 0)
const rootNodeId = computed(() => graphModel.value.nodes.find((node) => node.type === NodeType.START)?.id || graphModel.value.nodes[0]?.id || '')
const canUndo = computed(() => historyPast.value.length > 0)
const canRedo = computed(() => historyFuture.value.length > 0)
const canDeploy = computed(() => Boolean(workflow.value?.id && !workflow.value.id.startsWith('new_')))
const canvasOffsetClass = computed(() => (selectedNode.value || showGlobalConfig.value) ? 'mr-[24rem]' : '')

const nodeTypeOptions: SelectOption[] = [
  { value: NodeType.START, label: '开始' },
  { value: NodeType.APPROVAL, label: '审批' },
  { value: NodeType.PARALLEL, label: '会签/并行' },
  { value: NodeType.CONDITION, label: '条件分支' },
  { value: NodeType.NOTIFICATION, label: '通知' },
  { value: NodeType.SCRIPT, label: '脚本' },
  { value: NodeType.TIMER, label: '定时' },
  { value: NodeType.SUBPROCESS, label: '子流程' },
  { value: NodeType.MANUAL, label: '人工任务' },
  { value: NodeType.COPY, label: '抄送' },
  { value: NodeType.END, label: '完成' }
]

const approverTypeOptions: SelectOption[] = [
  { value: 'ROLE', label: '按角色' },
  { value: 'USER', label: '指定人员' },
  { value: 'USERS', label: '指定多人' },
  { value: 'INITIATOR', label: '发起人' },
  { value: 'DEPT_MANAGER', label: '部门负责人' },
  { value: 'DIRECT_LEADER', label: '直属上级' },
  { value: 'DEPT', label: '按部门' }
]

const signTypeOptions: SelectOption[] = [
  { value: 'ALL', label: '全签' },
  { value: 'ANY', label: '或签' },
  { value: 'PERCENT', label: '比例签' },
  { value: 'SEQUENTIAL', label: '顺序签' }
]

const branchStrategyOptions: SelectOption[] = [
  { value: 'EXCLUSIVE', label: '单选分支' },
  { value: 'PARALLEL', label: '并行处理' },
  { value: 'RACE', label: '竞争模式' }
]

const permissionTypeOptions: SelectOption[] = [
  { value: 'ALL', label: '所有人' },
  { value: 'ROLE', label: '指定角色' },
  { value: 'USER', label: '指定人员' },
  { value: 'DEPT', label: '指定部门' }
]

const categoryOptions: SelectOption[] = [
  { value: '', label: '未分类' },
  { value: 'OA', label: 'OA' },
  { value: 'HR', label: 'HR' },
  { value: 'FINANCE', label: '财务' },
  { value: 'ADMIN', label: '行政' },
  { value: 'OTHER', label: '其他' }
]

const workflowOptions = computed<SelectOption[]>(() => [
  { value: '', label: '新建空白流程' },
  ...workflows.value
    .filter((item) => item.definitionId || item.processKey)
    .map((item) => ({
      value: String(item.definitionId || item.processKey),
      label: `${item.processName || '未命名流程'} · ${item.processKey || '-'}`
    }))
])

const formOptions = computed<SelectOption[]>(() => [
  { value: '', label: '不绑定表单' },
  ...availableForms.value.map((item) => ({
    value: String(item.formId || item.formKey || ''),
    label: `${item.formName || item.formKey || '未命名表单'}`
  }))
])

const approverValueOptions = computed<SelectOption[]>(() => {
  const type = selectedNode.value?.approverType
  if (type === 'ROLE') {
    return availableRoles.value.map((item) => ({ value: item.roleKey, label: item.roleName }))
  }
  if (type === 'USER' || type === 'USERS') {
    return normalizeUsers(availableUsers.value).map((item) => ({ value: String(item.userId), label: item.nickName || item.userName }))
  }
  if (type === 'DEPT') {
    return flattenDeptTree(availableDepts.value).map((item) => ({ value: String(item.deptId), label: item.deptName }))
  }
  return []
})

const propsJsonText = computed({
  get: () => JSON.stringify(selectedNode.value?.props || {}, null, 2),
  set: (value: string) => updateSelectedNodePropsJson(value)
})

const canvasGridStyle = computed(() => ({
  background: 'radial-gradient(rgba(148,163,184,0.22) 0.8px, transparent 0.8px)',
  backgroundSize: '24px 24px',
  backgroundPosition: `${panOrigin.value.x}px ${panOrigin.value.y}px`
}))

const canvasTransformStyle = computed(() => ({
  transform: `translate(${panOrigin.value.x}px, ${panOrigin.value.y}px) scale(${zoom.value})`
}))

function normalizeUsers(data: unknown): SysUser[] {
  if (Array.isArray(data)) return data as SysUser[]
  if (data && typeof data === 'object') {
    const record = data as { rows?: SysUser[]; records?: SysUser[]; list?: SysUser[] }
    return record.rows || record.records || record.list || []
  }
  return []
}

function flattenDeptTree(nodes: SysDept[], result: SysDept[] = []) {
  nodes.forEach((node) => {
    result.push(node)
    if (Array.isArray(node.children) && node.children.length > 0) flattenDeptTree(node.children, result)
  })
  return result
}

function createDefaultWorkflow(): WorkflowDefinition {
  return {
    id: `new_${Date.now()}`,
    name: '新流程',
    key: 'new_process',
    version: 1,
    graph: createDefaultWorkflowGraph(),
    startPermissionType: 'ALL'
  }
}

function mapBackendWorkflow(item: ProcessDefinitionSummary): WorkflowDefinition {
  const graph = parseWorkflowGraphDefinition(item.modelJson) || createDefaultWorkflowGraph()
  return {
    id: String(item.definitionId || `new_${Date.now()}`),
    name: item.processName || '未命名流程',
    key: item.processKey || 'new_process',
    version: Number(item.version || 1),
    formId: item.formId ? String(item.formId) : undefined,
    graph,
    description: item.description,
    category: item.category,
    tags: item.tags,
    startPermissionType: item.startPermissionType || 'ALL',
    startPermissionValue: item.startPermissionValue,
    deptId: item.deptId != null ? Number(item.deptId) : undefined
  }
}

function resolveSavedDefinitionId(result: unknown): string | undefined {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    const id = record.id ?? record.definitionId
    if (id != null && String(id).trim()) return String(id)
  }
  if (typeof result === 'string' && result.trim()) return result.trim()
  return undefined
}

async function loadContext() {
  const [forms, roles, users, depts] = await Promise.all([
    getFormDefinitions({ pageSize: 200 }).catch(() => null),
    getRoleOptions().catch(() => []),
    getUserList({ pageNum: 1, pageSize: 200 }).catch(() => []),
    getDeptTree().catch(() => [])
  ])
  availableForms.value = normalizeWorkflowRows(forms)
  availableRoles.value = Array.isArray(roles) ? roles : []
  availableUsers.value = normalizeUsers(users)
  availableDepts.value = Array.isArray(depts) ? depts : []
}

async function loadWorkflowList() {
  const response = await getProcessDefinitions({ pageNum: 1, pageSize: 100, latestOnly: true })
  workflows.value = normalizeWorkflowRows(response)
  return workflows.value
}

async function loadWorkflow(definitionId?: string) {
  loading.value = true
  try {
    await loadContext()
    const rows = await loadWorkflowList()
    let selected: ProcessDefinitionSummary | null = null
    const targetId = definitionId || String(route.query.id || '')
    if (targetId) {
      selected = await getProcessDefinition(targetId).catch(() => rows.find((item) => String(item.definitionId) === targetId) || null)
    } else {
      selected = rows[0] || null
    }

    const nextWorkflow = selected ? mapBackendWorkflow(selected) : createDefaultWorkflow()
    workflow.value = nextWorkflow
    graphModel.value = nextWorkflow.graph
    selectedNodeId.value = null
    invalidNodeIds.value = []
    historyPast.value = []
    historyFuture.value = []
    showGlobalConfig.value = false
  } catch (error) {
    workflow.value = createDefaultWorkflow()
    graphModel.value = workflow.value.graph
    toast.error(getErrorMessage(error, '流程设计器加载失败'))
  } finally {
    loading.value = false
  }
}

function createNodeId(prefix = 'node') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildNewNode(type: NodeType): WorkflowGraphNode {
  const titleMap: Record<NodeType, string> = {
    [NodeType.START]: '开始',
    [NodeType.APPROVAL]: '审批节点',
    [NodeType.CONDITION]: '条件分支',
    [NodeType.PARALLEL]: '会签节点',
    [NodeType.END]: '流程结束',
    [NodeType.NOTIFICATION]: '通知节点',
    [NodeType.SCRIPT]: '脚本节点',
    [NodeType.TIMER]: '定时节点',
    [NodeType.SUBPROCESS]: '子流程节点',
    [NodeType.MANUAL]: '人工任务',
    [NodeType.COPY]: '抄送节点'
  }

  const node: WorkflowGraphNode = {
    id: createNodeId(type === NodeType.CONDITION ? 'branch' : 'node'),
    type,
    title: titleMap[type],
    props: {}
  }

  if ([NodeType.APPROVAL, NodeType.PARALLEL, NodeType.MANUAL, NodeType.COPY].includes(type)) {
    node.approverType = 'ROLE'
    node.approverValue = ''
  }
  if (type === NodeType.PARALLEL) {
    node.signType = 'ALL'
    node.passPercent = 100
  }
  if (type === NodeType.SCRIPT) node.props = { scriptType: 'API', apiUrl: '' }
  if (type === NodeType.TIMER) node.props = { timerType: 'DELAY', delayMinutes: 30 }
  if (type === NodeType.NOTIFICATION) node.props = { notificationTitle: '', notificationContent: '' }
  if (type === NodeType.MANUAL) node.props = { taskDescription: '' }

  return node
}

function commitGraph(nextGraph: WorkflowGraphDefinition, message?: string) {
  try {
    assertWorkflowGraphIntegrity(nextGraph)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '流程图结构无效')
    return false
  }
  historyPast.value = [...historyPast.value, graphModel.value]
  historyFuture.value = []
  graphModel.value = nextGraph
  if (workflow.value) workflow.value.graph = nextGraph
  if (message) toast.success(message)
  return true
}

function replaceGraph(nextGraph: WorkflowGraphDefinition) {
  graphModel.value = nextGraph
  if (workflow.value) workflow.value.graph = nextGraph
}

function undo() {
  const previous = historyPast.value[historyPast.value.length - 1]
  if (!previous) return
  historyPast.value = historyPast.value.slice(0, -1)
  historyFuture.value = [graphModel.value, ...historyFuture.value]
  replaceGraph(previous)
}

function redo() {
  const next = historyFuture.value[0]
  if (!next) return
  historyFuture.value = historyFuture.value.slice(1)
  historyPast.value = [...historyPast.value, graphModel.value]
  replaceGraph(next)
}

function updateSelectedApproverType(value: string | number | boolean | null) {
  const approverType = String(value || 'ROLE') as WorkflowGraphNode['approverType']
  updateSelectedNode({
    approverType,
    approverValue: '',
    props: { ...(selectedNode.value?.props || {}), approverLabel: '' }
  })
}

function updateSelectedApproverValue(value: string | number | boolean | null, option?: SelectOption | null) {
  updateSelectedNode({
    approverValue: String(value || ''),
    props: { ...(selectedNode.value?.props || {}), approverLabel: option?.label || '' }
  })
}

function updateSelectedSignType(value: string | number | boolean | null) {
  updateSelectedNode({ signType: String(value || 'ALL') as WorkflowGraphNode['signType'] })
}

function updateSelectedBranchStrategy(value: string | number | boolean | null) {
  updateSelectedNode({ branchStrategy: String(value || 'EXCLUSIVE') as WorkflowGraphNode['branchStrategy'] })
}

function addNode(parentId: string, type: NodeType) {
  const targetNode = findWorkflowGraphNode(graphModel.value, parentId)
  const anchorId = targetNode?.type === NodeType.END
    ? findWorkflowGraphParentNodeId(graphModel.value, parentId)
    : parentId
  if (!anchorId) {
    toast.error('无法在当前位置添加节点')
    return
  }
  const nextGraph = type === NodeType.END
    ? replaceWorkflowGraphNextNode(graphModel.value, anchorId, buildNewNode(type))
    : insertWorkflowGraphNodeAfter(graphModel.value, anchorId, buildNewNode(type))
  if (commitGraph(nextGraph, '节点已添加')) activeQuickAddId.value = null
}

function addBranch(parentId: string) {
  const targetNode = findWorkflowGraphNode(graphModel.value, parentId)
  const anchorId = targetNode?.type === NodeType.END
    ? findWorkflowGraphParentNodeId(graphModel.value, parentId)
    : parentId
  if (!anchorId) {
    toast.error('无法在当前位置添加分支')
    return
  }
  const branchNode = buildNewNode(NodeType.CONDITION)
  branchNode.title = `条件分支${countWorkflowGraphBranches(graphModel.value, anchorId) + 1}`
  branchNode.condition = 'amount > 0'
  const nextGraph = appendWorkflowGraphBranch(graphModel.value, anchorId, branchNode, 'EXCLUSIVE')
  if (commitGraph(nextGraph, '分支已添加')) selectedNodeId.value = branchNode.id
}

function updateNode(nodeId: string, patch: Partial<WorkflowGraphNode>) {
  const nextGraph = patchWorkflowGraphNode(graphModel.value, nodeId, patch)
  replaceGraph(nextGraph)
}

function updateSelectedNode(patch: Partial<WorkflowGraphNode>) {
  if (!selectedNodeId.value) return
  updateNode(selectedNodeId.value, patch)
}

function updateSelectedNodePropsJson(value: string) {
  if (!selectedNodeId.value) return
  try {
    const parsed = value.trim() ? JSON.parse(value) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast.error('扩展配置必须是 JSON 对象')
      return
    }
    updateNode(selectedNodeId.value, { props: parsed as Record<string, unknown> })
  } catch {
    toast.error('扩展配置 JSON 格式错误')
  }
}

function updateNodeProps(patch: Record<string, unknown>) {
  const current = selectedNode.value?.props && typeof selectedNode.value.props === 'object' ? selectedNode.value.props : {}
  updateSelectedNode({ props: { ...current, ...patch } })
}

function requestDeleteNode() {
  const node = selectedNode.value
  if (!node) return
  if ([NodeType.START, NodeType.END].includes(node.type as NodeType)) {
    toast.error('开始和结束节点不能删除')
    return
  }

  const parentId = findWorkflowGraphParentNodeId(graphModel.value, node.id)
  const branchRoot = isWorkflowGraphBranchRoot(graphModel.value, node.id)
  const branchCount = countWorkflowGraphBranches(graphModel.value, node.id)
  const message = branchRoot
    ? `删除条件分支“${node.title || node.id}”会一并删除分支下所有节点。`
    : branchCount > 0
      ? `删除节点“${node.title || node.id}”会一并删除其下方 ${branchCount} 个分支。`
      : `确认删除节点“${node.title || node.id}”？`

  confirmState.value = {
    title: '删除节点',
    message,
    danger: true,
    run: () => {
      const nextGraph = branchRoot && parentId
        ? removeWorkflowGraphBranch(graphModel.value, parentId, node.id)
        : removeWorkflowGraphNode(graphModel.value, node.id)
      if (commitGraph(nextGraph, '节点已删除')) selectedNodeId.value = null
    }
  }
}

function onNodeDragStart(nodeId: string, event: DragEvent) {
  draggingNodeId.value = nodeId
  event.dataTransfer?.setData('text/plain', nodeId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onNodeDragEnd() {
  draggingNodeId.value = null
  hoveredDropParentId.value = null
}

function dropOnParent(parentId: string, event: DragEvent) {
  const dragId = event.dataTransfer?.getData('text/plain') || draggingNodeId.value
  if (!dragId || dragId === parentId) return

  const dragNode = findWorkflowGraphNode(graphModel.value, dragId)
  if (!dragNode) return
  if ([NodeType.START, NodeType.END].includes(dragNode.type as NodeType)) {
    toast.error('开始和结束节点不能移动')
    return
  }
  const dragInsideBranch = isWorkflowGraphNodeInsideBranchScope(graphModel.value, dragId)
  const dropInsideBranch = isWorkflowGraphNodeInsideBranchScope(graphModel.value, parentId)
  if (dragInsideBranch !== dropInsideBranch) {
    toast.error('暂不支持主干与分支之间直接拖拽')
    return
  }
  if (dragInsideBranch) {
    toast.error('分支节点不能移动')
    return
  }
  if (isWorkflowGraphNodeInBranchSubtree(graphModel.value, dragId, parentId)) {
    toast.error('不能将节点移动到自己的子节点中')
    return
  }

  const nextGraph = moveWorkflowGraphNode(graphModel.value, dragId, parentId)
  commitGraph(nextGraph, '节点已移动')
}

function validateWorkflowGraph(): { errors: string[]; errorNodes: string[] } {
  const errors: string[] = []
  const errorNodes = new Set<string>()

  const pushError = (message: string, nodeId?: string) => {
    errors.push(message)
    if (nodeId) errorNodes.add(nodeId)
  }

  try {
    assertWorkflowGraphIntegrity(graphModel.value)
  } catch (error) {
    pushError(error instanceof Error ? error.message : '流程图结构无效')
  }

  graphModel.value.nodes.forEach((node) => {
    const title = String(node.title || '').trim() || '未命名节点'
    if (!String(node.title || '').trim()) pushError('有节点缺少名称', node.id)

    if ([NodeType.APPROVAL, NodeType.PARALLEL, NodeType.MANUAL, NodeType.COPY].includes(node.type as NodeType)) {
      if (!node.approverType) pushError(`节点“${title}”未配置处理方式`, node.id)
      if (!['DIRECT_LEADER', 'DEPT_MANAGER', 'INITIATOR'].includes(String(node.approverType || '')) && !node.approverValue) {
        pushError(`节点“${title}”未配置具体处理人`, node.id)
      }
    }

    if (node.type === NodeType.PARALLEL && node.signType === 'PERCENT') {
      const percent = Number(node.passPercent)
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) pushError(`会签节点“${title}”通过比例必须为 1-100`, node.id)
    }

    if (node.type === NodeType.CONDITION && !String(node.condition || '').trim()) {
      pushError(`条件分支“${title}”未配置触发条件`, node.id)
    }
  })

  return {
    errors: Array.from(new Set(errors)),
    errorNodes: Array.from(errorNodes)
  }
}

function buildSavePayload() {
  if (!workflow.value) throw new Error('流程未加载')
  return {
    definitionId: workflow.value.id.startsWith('new_') ? undefined : workflow.value.id,
    processName: workflow.value.name.trim(),
    processKey: workflow.value.key.trim(),
    formId: workflow.value.formId || undefined,
    modelJson: JSON.stringify(graphModel.value),
    description: workflow.value.description || undefined,
    category: workflow.value.category || undefined,
    tags: workflow.value.tags || undefined,
    startPermissionType: workflow.value.startPermissionType || 'ALL',
    startPermissionValue: workflow.value.startPermissionValue || undefined,
    deptId: workflow.value.deptId
  }
}

async function saveWorkflow(silent = false) {
  if (!workflow.value) return ''
  if (!workflow.value.name.trim()) {
    toast.error('请输入流程名称')
    return ''
  }
  if (!/^[a-zA-Z0-9_]+$/.test(workflow.value.key.trim())) {
    toast.error('流程Key只能包含英文字母、数字和下划线')
    return ''
  }

  const validation = validateWorkflowGraph()
  invalidNodeIds.value = validation.errorNodes
  if (validation.errors.length > 0) {
    validation.errors.slice(0, 3).forEach((message) => toast.error(message))
    return ''
  }

  saving.value = true
  try {
    const result = await saveProcessDefinition(buildSavePayload())
    const savedId = resolveSavedDefinitionId(result)
    if (savedId && workflow.value.id !== savedId) {
      workflow.value.id = savedId
      await router.replace({ path: route.path, query: { ...route.query, id: savedId } })
      await loadWorkflowList()
    }
    if (!silent) toast.success('流程已保存')
    return workflow.value.id
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
    return ''
  } finally {
    saving.value = false
  }
}

async function deployWorkflow() {
  const savedId = await saveWorkflow(true)
  if (!savedId || savedId.startsWith('new_')) return
  saving.value = true
  try {
    await deployProcessDefinition(savedId)
    toast.success('流程已发布')
  } catch (error) {
    toast.error(getErrorMessage(error, '发布失败'))
  } finally {
    saving.value = false
  }
}

async function exportCurrentWorkflow() {
  if (!workflow.value || workflow.value.id.startsWith('new_')) {
    toast.error('请先保存流程后再导出')
    return
  }
  saving.value = true
  try {
    const file = await exportWorkflow(workflow.value.id)
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = `${workflow.value.name || workflow.value.key}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('流程已导出')
  } catch (error) {
    toast.error(getErrorMessage(error, '导出失败'))
  } finally {
    saving.value = false
  }
}

function createBlankWorkflow() {
  const next = createDefaultWorkflow()
  workflow.value = next
  graphModel.value = next.graph
  selectedNodeId.value = null
  invalidNodeIds.value = []
  historyPast.value = []
  historyFuture.value = []
  void router.replace({ path: route.path, query: { mode: 'blank' } })
}

function onWorkflowSelect(value: string | number | boolean | null) {
  const selectedId = String(value || '')
  if (!selectedId) {
    createBlankWorkflow()
    return
  }
  void router.replace({ path: route.path, query: { id: selectedId } })
  void loadWorkflow(selectedId)
}

function zoomIn() {
  zoom.value = Math.min(1.6, Number((zoom.value + 0.1).toFixed(2)))
}

function zoomOut() {
  zoom.value = Math.max(0.6, Number((zoom.value - 0.1).toFixed(2)))
}

function resetZoom() {
  zoom.value = 1
  panOrigin.value = { x: 0, y: 0 }
}

function onCanvasPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  if (target.closest('[data-flow-interactive="true"]')) return
  if (event.button !== 0 && event.button !== 1) return
  event.preventDefault()
  isPanning.value = true
  panStart.value = {
    x: event.clientX - panOrigin.value.x,
    y: event.clientY - panOrigin.value.y
  }
}

function onCanvasPointerMove(event: PointerEvent) {
  if (!isPanning.value) return
  panOrigin.value = {
    x: event.clientX - panStart.value.x,
    y: event.clientY - panStart.value.y
  }
}

function onCanvasPointerUp() {
  isPanning.value = false
}

function closeConfirm() {
  confirmState.value = null
}

async function confirmAction() {
  const action = confirmState.value
  if (!action) return
  await action.run()
  confirmState.value = null
}

onMounted(() => {
  void loadWorkflow(String(route.query.id || ''))
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/80 px-1 pb-3 pt-1 dark:border-slate-800">
      <div class="min-w-0">
        <div class="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
          {{ workflow?.key && workflow.key !== 'new_process' ? `流程 KEY · ${workflow.key}` : 'Workflow Studio' }}
        </div>
        <h1 class="mt-1.5 truncate text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {{ workflow?.name || '流程设计' }}
        </h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="w-[280px]">
          <Select
            :model-value="workflow?.id && !workflow.id.startsWith('new_') ? workflow.id : ''"
            :options="workflowOptions"
            searchable
            trigger-class="h-10"
            @update:model-value="onWorkflowSelect"
          />
        </div>
        <Button variant="outline" :disabled="loading" @click="loadWorkflow(String(route.query.id || ''))">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新
        </Button>
      </div>
    </div>

    <div class="relative min-h-[calc(100vh-238px)] overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div class="flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-950">
        <div class="grid min-w-0 flex-1 gap-2 md:grid-cols-[220px_180px_minmax(0,1fr)]">
          <Input v-model="workflowName" placeholder="流程名称" />
          <Input v-model="workflowKey" placeholder="流程Key" />
          <div class="hidden items-center truncate rounded-xl border border-slate-200 px-3 text-xs text-slate-500 dark:border-slate-800 md:flex">
            <GitMerge class="mr-2 h-4 w-4 text-teal-600" />
            {{ graphModel.nodes.length }} 节点 · {{ graphModel.edges.length }} 连线
          </div>
        </div>
        <Button size="icon" variant="outline" :disabled="!canUndo" title="撤销" @click="undo"><Undo2 class="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" :disabled="!canRedo" title="重做" @click="redo"><Redo2 class="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" title="全局属性" @click="showGlobalConfig = true; selectedNodeId = null"><Settings class="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" :disabled="saving || !canDeploy" title="导出" @click="exportCurrentWorkflow"><Download class="h-4 w-4" /></Button>
        <Button variant="outline" :disabled="saving" @click="saveWorkflow()"><Save class="h-4 w-4" />保存</Button>
        <Button :disabled="saving" @click="deployWorkflow"><Rocket class="h-4 w-4" />发布</Button>
      </div>

      <div v-if="loading" class="flex min-h-[calc(100vh-294px)] items-center justify-center">
        <div class="border border-slate-200 bg-white px-8 py-10 text-center dark:border-slate-800 dark:bg-slate-950/88">
          <Loader2 class="mx-auto h-8 w-8 animate-spin text-slate-500" />
          <div class="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">正在加载流程设计器</div>
        </div>
      </div>

      <div
        v-else
        class="workflow-studio-canvas relative flex min-h-[calc(100vh-294px)] justify-center overflow-hidden bg-slate-50/60 p-4 transition-all duration-300 dark:bg-slate-950"
        :class="[isPanning ? 'cursor-grabbing' : 'cursor-default', canvasOffsetClass]"
        @pointerdown="onCanvasPointerDown"
        @pointermove="onCanvasPointerMove"
        @pointerup="onCanvasPointerUp"
        @pointerleave="onCanvasPointerUp"
        @click="activeQuickAddId = null; selectedNodeId = null"
      >
        <div class="pointer-events-none absolute inset-0" :style="canvasGridStyle" />

        <div
          v-if="draggingNodeId"
          class="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
        >
          <AlertTriangle class="h-3.5 w-3.5" />
          拖拽节点到连接线上的“拖到这里”区域即可移动
        </div>

        <div class="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
          <button type="button" class="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900" title="缩小" @click.stop="zoomOut">
            <ZoomOut class="h-4 w-4" />
          </button>
          <span class="min-w-[42px] text-center font-mono text-xs text-slate-500 dark:text-slate-400">{{ Math.round(zoom * 100) }}%</span>
          <button type="button" class="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900" title="放大" @click.stop="zoomIn">
            <ZoomIn class="h-4 w-4" />
          </button>
          <div class="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-800" />
          <button type="button" class="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900" title="重置缩放" @click.stop="resetZoom">
            <Maximize2 class="h-4 w-4" />
          </button>
        </div>

        <div class="z-10 flex min-w-[820px] origin-top justify-center pb-40 transition-transform" :style="canvasTransformStyle">
          <WorkflowFlowNode
            v-if="rootNodeId"
            :graph="graphModel"
            :node-id="rootNodeId"
            :selected-node-id="selectedNodeId"
            :invalid-node-ids="invalidNodeIds"
            :active-quick-add-id="activeQuickAddId"
            :hovered-drop-parent-id="hoveredDropParentId"
            :dragging-node-id="draggingNodeId"
            :is-dragging-global="Boolean(draggingNodeId)"
            @select-node="selectedNodeId = $event; showGlobalConfig = false"
            @add-node="addNode"
            @add-branch="addBranch"
            @toggle-quick-add="activeQuickAddId = $event"
            @start-node-drag="onNodeDragStart"
            @end-node-drag="onNodeDragEnd"
            @drop-on-parent="dropOnParent"
            @set-hovered-drop-parent="hoveredDropParentId = $event"
          />
        </div>
      </div>

      <aside
        v-if="selectedNode"
        class="absolute bottom-0 right-0 top-14 z-30 flex w-[24rem] flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        data-flow-interactive="true"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">节点属性</div>
            <div class="mt-0.5 text-[11px] text-slate-500">{{ selectedNode.id }}</div>
          </div>
          <button type="button" class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-900" @click="selectedNodeId = null">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 space-y-4 overflow-y-auto p-4">
          <Input :model-value="selectedNode.title || ''" label="节点名称" @update:model-value="updateSelectedNode({ title: $event })" />
          <label class="space-y-2">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">节点类型</span>
            <Select :model-value="selectedNode.type" :options="nodeTypeOptions" disabled />
          </label>

          <TextArea
            v-if="selectedNode.type === NodeType.CONDITION"
            :model-value="String(selectedNode.condition || '')"
            label="触发条件"
            placeholder="amount > 1000"
            :rows="3"
            @update:model-value="updateSelectedNode({ condition: $event })"
          />

          <template v-if="[NodeType.APPROVAL, NodeType.PARALLEL, NodeType.MANUAL, NodeType.COPY].includes(selectedNode.type as NodeType)">
            <label class="space-y-2">
              <span class="text-sm font-medium text-slate-700 dark:text-slate-200">处理方式</span>
              <Select
                :model-value="selectedNode.approverType || 'ROLE'"
                :options="approverTypeOptions"
                @update:model-value="updateSelectedApproverType"
              />
            </label>
            <label v-if="approverValueOptions.length" class="space-y-2">
              <span class="text-sm font-medium text-slate-700 dark:text-slate-200">处理人</span>
              <Select
                :model-value="selectedNode.approverValue || ''"
                :options="approverValueOptions"
                searchable
                @change="updateSelectedApproverValue"
              />
            </label>
            <Input v-else :model-value="selectedNode.approverValue || ''" label="处理人值" @update:model-value="updateSelectedNode({ approverValue: $event })" />
          </template>

          <template v-if="selectedNode.type === NodeType.PARALLEL">
            <label class="space-y-2">
              <span class="text-sm font-medium text-slate-700 dark:text-slate-200">会签方式</span>
              <Select :model-value="selectedNode.signType || 'ALL'" :options="signTypeOptions" @update:model-value="updateSelectedSignType" />
            </label>
            <Input v-if="selectedNode.signType === 'PERCENT'" :model-value="selectedNode.passPercent || 100" type="number" label="通过比例(%)" @update:model-value="updateSelectedNode({ passPercent: Number($event || 0) })" />
          </template>

          <label v-if="selectedNodeBranchCount > 0" class="space-y-2">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">分支策略</span>
            <Select :model-value="selectedNode.branchStrategy || 'EXCLUSIVE'" :options="branchStrategyOptions" @update:model-value="updateSelectedBranchStrategy" />
          </label>

          <template v-if="selectedNode.type === NodeType.NOTIFICATION">
            <Input :model-value="String(selectedNode.props?.notificationTitle || '')" label="通知标题" @update:model-value="updateNodeProps({ notificationTitle: $event })" />
            <TextArea :model-value="String(selectedNode.props?.notificationContent || '')" label="通知内容" :rows="3" @update:model-value="updateNodeProps({ notificationContent: $event })" />
          </template>

          <template v-if="selectedNode.type === NodeType.SCRIPT">
            <Input :model-value="String(selectedNode.props?.apiUrl || '')" label="API URL" @update:model-value="updateNodeProps({ apiUrl: $event })" />
          </template>

          <template v-if="selectedNode.type === NodeType.TIMER">
            <Input :model-value="Number(selectedNode.props?.delayMinutes || 30)" type="number" label="延迟分钟" @update:model-value="updateNodeProps({ delayMinutes: Number($event || 0) })" />
          </template>

          <TextArea :model-value="selectedNode.description || ''" label="节点说明" :rows="3" @update:model-value="updateSelectedNode({ description: $event })" />
          <TextArea v-model="propsJsonText" label="扩展配置 JSON" :rows="5" />
        </div>
        <div class="border-t border-slate-200 p-4 dark:border-slate-800">
          <Button variant="danger" class="w-full" @click="requestDeleteNode">
            <Trash2 class="h-4 w-4" />
            删除节点
          </Button>
        </div>
      </aside>

      <aside
        v-if="showGlobalConfig && workflow"
        class="absolute bottom-0 right-0 top-14 z-30 flex w-[24rem] flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        data-flow-interactive="true"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">全局属性</div>
          <button type="button" class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-900" @click="showGlobalConfig = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 space-y-4 overflow-y-auto p-4">
          <TextArea v-model="workflow.description" label="流程描述" :rows="4" />
          <label class="space-y-2">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">流程分类</span>
            <Select v-model="workflow.category" :options="categoryOptions" />
          </label>
          <label class="space-y-2">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">关联表单</span>
            <Select v-model="workflow.formId" :options="formOptions" searchable />
          </label>
          <Input v-model="workflow.tags" label="流程标签" placeholder="多个标签用逗号分隔" />
          <label class="space-y-2">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">发起权限</span>
            <Select v-model="workflow.startPermissionType" :options="permissionTypeOptions" />
          </label>
          <Input v-if="workflow.startPermissionType !== 'ALL'" v-model="workflow.startPermissionValue" label="权限值" placeholder="角色Key、用户ID或部门ID" />
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60">
            <CheckCircle2 class="mb-2 h-4 w-4 text-teal-600" />
            全局属性保存时会写入流程定义，与画布结构一起提交。
          </div>
        </div>
      </aside>
    </div>

    <ConfirmDialog
      :show="Boolean(confirmState)"
      :title="confirmState?.title || '确认操作'"
      :message="confirmState?.message || ''"
      confirm-text="确定"
      :danger="confirmState?.danger"
      @cancel="closeConfirm"
      @confirm="confirmAction"
    />
  </div>
</template>
