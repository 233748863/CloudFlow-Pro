<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown,
  Bell,
  Clock,
  Code,
  Flag,
  GitBranch,
  Layers,
  Move,
  PlayCircle,
  Plus,
  Send,
  UserCheck,
  Workflow
} from 'lucide-vue-next'
import { NodeType, type WorkflowGraphDefinition } from '@/types'
import {
  countWorkflowGraphBranches,
  findWorkflowGraphMainTargetId,
  findWorkflowGraphNode,
  getWorkflowGraphBranchChildIds
} from '@/utils/workflowGraph'

defineOptions({ name: 'WorkflowFlowNode' })

const props = defineProps<{
  graph: WorkflowGraphDefinition
  nodeId: string
  selectedNodeId?: string | null
  invalidNodeIds?: string[]
  activeQuickAddId?: string | null
  hoveredDropParentId?: string | null
  draggingNodeId?: string | null
  isDraggingGlobal?: boolean
  isInsideBranch?: boolean
}>()

const emit = defineEmits<{
  selectNode: [nodeId: string]
  addNode: [parentId: string, type: NodeType]
  addBranch: [parentId: string]
  toggleQuickAdd: [parentId: string | null]
  startNodeDrag: [nodeId: string, event: DragEvent]
  endNodeDrag: []
  dropOnParent: [parentId: string, event: DragEvent]
  setHoveredDropParent: [parentId: string | null]
}>()

const NODE_TYPE_LABELS: Record<string, string> = {
  [NodeType.START]: '开始',
  [NodeType.APPROVAL]: '审批',
  [NodeType.CONDITION]: '条件判断',
  [NodeType.PARALLEL]: '同时处理',
  [NodeType.END]: '完成',
  [NodeType.NOTIFICATION]: '通知',
  [NodeType.SCRIPT]: '脚本',
  [NodeType.TIMER]: '定时',
  [NodeType.SUBPROCESS]: '子流程',
  [NodeType.MANUAL]: '人工任务',
  [NodeType.COPY]: '抄送'
}

const APPROVER_TYPE_LABELS: Record<string, string> = {
  ROLE: '按角色',
  USER: '指定人员',
  USERS: '指定多人',
  INITIATOR: '发起人',
  DEPT_MANAGER: '部门负责人',
  DIRECT_LEADER: '直属上级',
  DEPT: '按部门'
}

const BRANCH_STRATEGY_LABELS: Record<string, string> = {
  EXCLUSIVE: '单选分支',
  PARALLEL: '并行处理',
  RACE: '竞争模式'
}

const nodeMetaMap = {
  [NodeType.START]: { icon: PlayCircle, label: '开始' },
  [NodeType.APPROVAL]: { icon: UserCheck, label: '审批' },
  [NodeType.CONDITION]: { icon: GitBranch, label: '条件' },
  [NodeType.PARALLEL]: { icon: Layers, label: '并行' },
  [NodeType.END]: { icon: Flag, label: '完成' },
  [NodeType.NOTIFICATION]: { icon: Bell, label: '通知' },
  [NodeType.SCRIPT]: { icon: Code, label: '脚本' },
  [NodeType.TIMER]: { icon: Clock, label: '定时' },
  [NodeType.SUBPROCESS]: { icon: Workflow, label: '子流程' },
  [NodeType.MANUAL]: { icon: UserCheck, label: '人工' },
  [NodeType.COPY]: { icon: Send, label: '抄送' }
}

const quickAddOptions = [
  { type: NodeType.APPROVAL, icon: UserCheck, label: '审批节点' },
  { type: NodeType.PARALLEL, icon: Layers, label: '会签节点' },
  { type: NodeType.NOTIFICATION, icon: Bell, label: '通知节点' },
  { type: NodeType.SCRIPT, icon: Code, label: '脚本节点' },
  { type: NodeType.TIMER, icon: Clock, label: '定时节点' },
  { type: NodeType.SUBPROCESS, icon: Workflow, label: '子流程节点' },
  { type: NodeType.MANUAL, icon: UserCheck, label: '人工任务' },
  { type: NodeType.COPY, icon: Send, label: '抄送节点' },
  { type: NodeType.CONDITION, icon: GitBranch, label: '条件分支', branch: true }
]

const node = computed(() => findWorkflowGraphNode(props.graph, props.nodeId))
const mainTargetId = computed(() => findWorkflowGraphMainTargetId(props.graph, props.nodeId))
const nextNode = computed(() => mainTargetId.value ? findWorkflowGraphNode(props.graph, mainTargetId.value) : null)
const branchChildIds = computed(() => getWorkflowGraphBranchChildIds(props.graph, props.nodeId))
const branchCount = computed(() => countWorkflowGraphBranches(props.graph, props.nodeId))
const meta = computed(() => nodeMetaMap[String(node.value?.type || '') as NodeType] || nodeMetaMap[NodeType.APPROVAL])
const selected = computed(() => props.selectedNodeId === props.nodeId)
const invalid = computed(() => Boolean(props.invalidNodeIds?.includes(props.nodeId)))
const canDrag = computed(() => Boolean(node.value && ![NodeType.START, NodeType.END].includes(node.value.type as NodeType) && !props.isInsideBranch))
const showQuickAdd = computed(() => props.activeQuickAddId === props.nodeId)
const dropActive = computed(() => props.hoveredDropParentId === props.nodeId)
const canAddBranch = computed(() => {
  const current = node.value
  if (!current || current.type === NodeType.END) return false
  if (current.type !== NodeType.PARALLEL) return true
  return Boolean(current.signType && !['ALL', 'ANY', 'PERCENT', 'SEQUENTIAL'].includes(String(current.signType)))
})

const metaText = computed(() => {
  const current = node.value
  if (!current) return ''

  if (current.type === NodeType.PARALLEL) {
    if (branchCount.value > 0 && current.branchStrategy) {
      return `${BRANCH_STRATEGY_LABELS[current.branchStrategy] || current.branchStrategy} · ${branchCount.value} 分支`
    }
    if (current.signType === 'ANY') return '会签 · 或签'
    if (current.signType === 'PERCENT') return `会签 · 比例签 ${current.passPercent || 0}%`
    if (current.signType === 'SEQUENTIAL') return '会签 · 顺序签'
    return '会签 · 全签'
  }

  if (branchCount.value > 0 && current.branchStrategy) {
    return `${BRANCH_STRATEGY_LABELS[current.branchStrategy] || current.branchStrategy} · ${branchCount.value} 分支`
  }

  return NODE_TYPE_LABELS[current.type] || current.type
})

const assigneeText = computed(() => {
  const current = node.value
  if (!current) return ''
  const typeLabel = current.approverType ? APPROVER_TYPE_LABELS[current.approverType] || current.approverType : ''
  const displayText = typeof current.props?.approverLabel === 'string' ? current.props.approverLabel : current.approverValue
  if (!displayText) return typeLabel

  const parts = String(displayText)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const compactText = parts.length > 2 ? `${parts.slice(0, 2).join(', ')} 等${parts.length}项` : String(displayText)
  return typeLabel ? `${typeLabel} · ${compactText}` : compactText
})

function emitQuickAdd(option: { type: NodeType; branch?: boolean }) {
  if (option.branch) {
    emit('addBranch', props.nodeId)
    return
  }
  emit('addNode', props.nodeId, option.type)
}

function onDragOver(event: DragEvent) {
  if (!props.isDraggingGlobal) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  emit('setHoveredDropParent', props.nodeId)
}

function onDrop(event: DragEvent) {
  if (!props.isDraggingGlobal) return
  event.preventDefault()
  emit('dropOnParent', props.nodeId, event)
  emit('setHoveredDropParent', null)
}
</script>

<template>
  <div v-if="node" class="workflow-flow-node relative flex flex-col items-center">
    <div class="relative group" :class="showQuickAdd ? 'z-50' : ''">
      <button
        type="button"
        class="workflow-node-card relative z-10 w-[208px] cursor-pointer rounded-md border bg-white text-left transition-colors duration-150 dark:bg-slate-950/90"
        :class="[
          selected ? 'border-cyan-300 bg-cyan-50/60 dark:border-cyan-700 dark:bg-cyan-950/20' : 'border-slate-200 hover:border-cyan-200 dark:border-slate-800 dark:hover:border-cyan-800',
          invalid ? 'border-rose-400 bg-rose-50/40 dark:border-rose-500 dark:bg-rose-950/10' : '',
          draggingNodeId === nodeId ? 'scale-[0.98] opacity-40' : ''
        ]"
        :draggable="canDrag"
        data-flow-interactive="true"
        @click.stop="emit('selectNode', nodeId); emit('toggleQuickAdd', null)"
        @dragstart.stop="emit('startNodeDrag', nodeId, $event)"
        @dragend="emit('endNodeDrag')"
      >
        <div class="p-3">
          <div class="flex items-start gap-2">
            <div class="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <component :is="meta.icon" class="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-200" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-semibold text-slate-700 dark:text-slate-100">{{ node.title || meta.label }}</div>
                  <div class="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">{{ metaText }}</div>
                </div>
                <Move v-if="canDrag" class="mt-0.5 h-3.5 w-3.5 text-slate-300" />
              </div>
              <div v-if="assigneeText || node.condition" class="mt-1.5 space-y-1 text-[11px] leading-5">
                <div v-if="assigneeText" class="truncate text-slate-600 dark:text-slate-300">{{ assigneeText }}</div>
                <div v-if="node.condition" class="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">条件 · {{ node.condition }}</div>
              </div>
            </div>
          </div>
        </div>
      </button>

      <div
        class="absolute left-1/2 z-30 -translate-x-1/2 transition-opacity duration-200"
        :class="[node.type === NodeType.END ? '-top-6' : '-bottom-2', showQuickAdd ? 'opacity-100' : 'opacity-0 group-hover:opacity-100']"
        data-flow-interactive="true"
      >
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
          :class="showQuickAdd ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-cyan-200 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400'"
          :title="showQuickAdd ? '关闭菜单' : node.type === NodeType.END ? '在结束前添加节点' : '添加节点'"
          @click.stop="emit('toggleQuickAdd', showQuickAdd ? null : nodeId)"
        >
          <Plus class="h-4 w-4" />
        </button>

        <div
          v-if="showQuickAdd"
          class="absolute left-1/2 z-[100] min-w-[176px] -translate-x-1/2 rounded-md border border-cyan-100 bg-white p-2 shadow-lg dark:border-cyan-950/40 dark:bg-slate-950"
          :class="node.type === NodeType.END ? 'bottom-9' : 'top-9'"
          @click.stop
        >
          <button
            v-for="option in quickAddOptions"
            v-show="!option.branch || canAddBranch"
            :key="`${option.type}-${option.branch ? 'branch' : 'node'}`"
            type="button"
            class="mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/20"
            @click="emitQuickAdd(option)"
          >
            <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-100 bg-cyan-50 dark:border-cyan-950/40 dark:bg-cyan-950/20">
              <component :is="option.icon" class="h-3.5 w-3.5 text-slate-500 dark:text-slate-300" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-medium text-slate-700 dark:text-slate-100">{{ option.label }}</div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <div v-if="branchChildIds.length > 0" class="mt-6 flex w-full flex-none flex-col items-center">
      <div class="h-6 w-0.5 bg-slate-300 dark:bg-slate-700" />
      <div class="z-10 -mb-px h-2.5 w-2.5 rotate-45 border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900" />
      <div class="relative flex w-full justify-center gap-12 pt-6 text-center">
        <div
          class="absolute top-0 h-0.5 bg-slate-300 dark:bg-slate-700"
          :style="{ left: `${100 / branchChildIds.length / 2}%`, right: `${100 / branchChildIds.length / 2}%` }"
        />
        <div v-for="(branchId, index) in branchChildIds" :key="branchId" class="relative flex w-full min-w-[240px] flex-col items-center">
          <div class="absolute left-1/2 top-0 -mt-6 h-6 w-0.5 -translate-x-1/2 bg-slate-300 dark:bg-slate-700" />
          <div class="absolute -top-10 left-1/2 z-10 -translate-x-1/2">
            <div class="whitespace-nowrap text-[10px] font-medium text-slate-500 dark:text-slate-400">分支 {{ index + 1 }}</div>
          </div>
          <div class="flex w-full flex-none justify-center">
            <WorkflowFlowNode
              :graph="graph"
              :node-id="branchId"
              :selected-node-id="selectedNodeId"
              :invalid-node-ids="invalidNodeIds"
              :active-quick-add-id="activeQuickAddId"
              :hovered-drop-parent-id="hoveredDropParentId"
              :dragging-node-id="draggingNodeId"
              :is-dragging-global="isDraggingGlobal"
              :is-inside-branch="true"
              @select-node="emit('selectNode', $event)"
              @add-node="(parentId, type) => emit('addNode', parentId, type)"
              @add-branch="emit('addBranch', $event)"
              @toggle-quick-add="emit('toggleQuickAdd', $event)"
              @start-node-drag="(dragId, event) => emit('startNodeDrag', dragId, event)"
              @end-node-drag="emit('endNodeDrag')"
              @drop-on-parent="(parentId, event) => emit('dropOnParent', parentId, event)"
              @set-hovered-drop-parent="emit('setHoveredDropParent', $event)"
            />
          </div>
          <div class="min-h-10 w-0.5 flex-1 bg-slate-300 dark:bg-slate-700" />
        </div>
        <div
          class="absolute bottom-0 h-0.5 bg-slate-300 dark:bg-slate-700"
          :style="{ left: `${100 / branchChildIds.length / 2}%`, right: `${100 / branchChildIds.length / 2}%` }"
        />
      </div>
      <div class="z-10 -mt-1.5 h-3 w-3 rounded-full border-2 border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950" />
    </div>

    <div v-if="mainTargetId" class="flex w-full flex-col items-center">
      <div
        class="relative flex flex-col items-center py-1"
        data-flow-interactive="true"
        @dragover="onDragOver"
        @dragleave="emit('setHoveredDropParent', null)"
        @drop="onDrop"
      >
        <div class="h-10 w-0.5 transition-all" :class="dropActive ? 'bg-cyan-500 dark:bg-cyan-300' : 'bg-slate-300 dark:bg-slate-700'" />
        <div
          v-if="isDraggingGlobal && draggingNodeId !== nodeId && draggingNodeId !== mainTargetId"
          class="absolute left-1/2 top-1/2 z-20 flex h-8 w-28 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed transition-colors"
          :class="dropActive ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/20' : 'border-slate-300 bg-white hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-950'"
        >
          <Move class="h-3.5 w-3.5" :class="dropActive ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-400 dark:text-slate-500'" />
          <span class="text-[11px] font-medium" :class="dropActive ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-400 dark:text-slate-500'">
            {{ dropActive ? '松开放置' : '拖入空位' }}
          </span>
        </div>
        <ArrowDown class="-mb-1 -mt-1 h-3.5 w-3.5" :class="dropActive ? 'text-cyan-500 dark:text-cyan-300' : 'text-slate-300 dark:text-slate-700'" />
      </div>

      <WorkflowFlowNode
        v-if="nextNode"
        :graph="graph"
        :node-id="nextNode.id"
        :selected-node-id="selectedNodeId"
        :invalid-node-ids="invalidNodeIds"
        :active-quick-add-id="activeQuickAddId"
        :hovered-drop-parent-id="hoveredDropParentId"
        :dragging-node-id="draggingNodeId"
        :is-dragging-global="isDraggingGlobal"
        :is-inside-branch="isInsideBranch"
        @select-node="emit('selectNode', $event)"
        @add-node="(parentId, type) => emit('addNode', parentId, type)"
        @add-branch="emit('addBranch', $event)"
        @toggle-quick-add="emit('toggleQuickAdd', $event)"
        @start-node-drag="(dragId, event) => emit('startNodeDrag', dragId, event)"
        @end-node-drag="emit('endNodeDrag')"
        @drop-on-parent="(parentId, event) => emit('dropOnParent', parentId, event)"
        @set-hovered-drop-parent="emit('setHoveredDropParent', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.workflow-node-card {
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
</style>
