<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRightLeft, Clock3, History, RefreshCcw, RotateCcw } from 'lucide-vue-next'
import { BaseDialog, Button, EmptyState, Panel, TextArea } from '@/components/common'
import {
  checkWorkflowRunningInstances,
  compareWorkflowVersions,
  getProcessDefinition,
  getWorkflowVersions,
  rollbackWorkflowVersion,
  type VersionComparison,
  type WorkflowRecord,
  type WorkflowVersionRecord
} from '@/services/api/workflow'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const workflowId = computed(() => String(route.params.workflowId || '').trim())
const workflowInfo = ref<WorkflowRecord | null>(null)
const versions = ref<WorkflowVersionRecord[]>([])
const selectedVersions = ref<string[]>([])
const comparison = ref<VersionComparison | null>(null)
const rollbackVersion = ref<WorkflowVersionRecord | null>(null)
const rollbackReason = ref('')
const forceRollback = ref(false)
const hasRunningInstances = ref(false)
const loading = ref(false)
const comparing = ref(false)
const saving = ref(false)
const compareOpen = ref(false)
const rollbackOpen = ref(false)

const currentVersion = computed(() => versions.value[0] || null)
const rollbackCount = computed(() => versions.value.filter((item) => Boolean(item.isRollback)).length)
const workflowName = computed(() => String(workflowInfo.value?.processName || workflowInfo.value?.workflowName || workflowInfo.value?.name || '流程'))

const hasDiff = computed(() =>
  Boolean(
    comparison.value?.addedNodes?.length ||
    comparison.value?.removedNodes?.length ||
    comparison.value?.modifiedNodes?.length ||
    comparison.value?.addedEdges?.length ||
    comparison.value?.removedEdges?.length
  )
)

function formatDateTime(value: unknown) {
  const text = String(value || '')
  if (!text) return '暂无时间'
  const date = new Date(text.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function changeTypeLabel(type: unknown) {
  const map: Record<string, string> = { major: '重大变更', minor: '功能迭代', patch: '细节修复' }
  return map[String(type || 'patch')] || '细节修复'
}

function rowId(row: WorkflowVersionRecord) {
  return String(row.id || '')
}

function formatNodeName(row: WorkflowRecord) {
  return String(row.nodeName || row.name || row.nodeId || row.id || '-')
}

function formatEdge(row: WorkflowRecord) {
  return `${String(row.sourceId || row.source || '-') } -> ${String(row.targetId || row.target || '-')}`
}

async function loadWorkflowInfo() {
  if (!workflowId.value) return
  try {
    workflowInfo.value = await getProcessDefinition(workflowId.value)
  } catch {
    workflowInfo.value = null
  }
}

async function loadVersions() {
  if (!workflowId.value) return
  loading.value = true
  try {
    versions.value = await getWorkflowVersions(workflowId.value)
  } catch (error) {
    versions.value = []
    toast.error(getErrorMessage(error, '加载版本历史失败'))
  } finally {
    loading.value = false
  }
}

function toggleVersion(version: WorkflowVersionRecord) {
  const id = rowId(version)
  if (!id) return
  if (selectedVersions.value.includes(id)) {
    selectedVersions.value = selectedVersions.value.filter((item) => item !== id)
    return
  }
  if (selectedVersions.value.length >= 2) {
    toast.error('最多只能选择两个版本进行对比')
    return
  }
  selectedVersions.value = [...selectedVersions.value, id]
}

async function compareVersions() {
  if (selectedVersions.value.length !== 2) {
    toast.error('请选择两个版本后再进行对比')
    return
  }
  comparing.value = true
  try {
    comparison.value = await compareWorkflowVersions(selectedVersions.value[0], selectedVersions.value[1])
    compareOpen.value = true
  } catch (error) {
    toast.error(getErrorMessage(error, '版本对比失败'))
  } finally {
    comparing.value = false
  }
}

async function openRollback(version: WorkflowVersionRecord) {
  rollbackVersion.value = version
  rollbackReason.value = ''
  forceRollback.value = false
  hasRunningInstances.value = false
  rollbackOpen.value = true
  try {
    const data = await checkWorkflowRunningInstances(workflowId.value)
    hasRunningInstances.value = Boolean(data?.hasRunningInstances)
  } catch {
    hasRunningInstances.value = false
  }
}

async function submitRollback() {
  if (!rollbackVersion.value?.id) return
  if (!rollbackReason.value.trim()) {
    toast.error('请输入回滚原因')
    return
  }
  saving.value = true
  try {
    await rollbackWorkflowVersion({
      workflowId: workflowId.value,
      targetVersionId: rollbackVersion.value.id,
      reason: rollbackReason.value.trim(),
      forceRollback: forceRollback.value
    })
    rollbackOpen.value = false
    rollbackVersion.value = null
    selectedVersions.value = []
    toast.success('版本回滚成功')
    await loadVersions()
  } catch (error) {
    toast.error(getErrorMessage(error, '版本回滚失败'))
  } finally {
    saving.value = false
  }
}

watch(workflowId, () => {
  selectedVersions.value = []
  void Promise.all([loadWorkflowInfo(), loadVersions()])
})

onMounted(() => {
  void Promise.all([loadWorkflowInfo(), loadVersions()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <History class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Version History
        </div>
        <h1 class="mt-1.5 truncate text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{{ workflowName }}版本历史</h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" @click="router.back()"><ArrowLeft class="h-4 w-4" />返回</Button>
        <Button variant="outline" size="sm" :disabled="loading" @click="loadVersions"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button variant="outline" size="sm" :disabled="selectedVersions.length !== 2 || comparing" @click="compareVersions"><ArrowRightLeft class="h-4 w-4" />对比</Button>
      </div>
    </div>

    <Panel title="版本时间线">
      <template #actions>
        <div class="text-xs text-slate-500">版本 {{ versions.length }} · 当前 {{ currentVersion ? `v${currentVersion.versionNumber}` : '未生成' }} · 回滚 {{ rollbackCount }} · 已选 {{ selectedVersions.length }}/2</div>
      </template>

      <div v-if="loading" class="py-12 text-center text-sm text-slate-500">正在加载版本历史...</div>
      <EmptyState v-else-if="versions.length === 0" title="暂无版本历史" description="当前流程还没有可供查看的历史版本" />
      <div v-else class="divide-y divide-slate-100 dark:divide-slate-800">
        <div v-for="(version, index) in versions" :key="rowId(version) || index" class="px-1 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div class="flex min-w-0 flex-1 gap-3">
              <div class="relative flex flex-col items-center pt-1">
                <input type="checkbox" :checked="selectedVersions.includes(rowId(version))" class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950" :aria-label="`选择版本 v${version.versionNumber}`" @change="toggleVersion(version)">
                <span v-if="index !== versions.length - 1" class="mt-2.5 h-full min-h-[36px] w-px bg-slate-200 dark:bg-slate-800" />
              </div>
              <div class="min-w-0 flex-1 space-y-1.5">
                <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span class="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">v{{ version.versionNumber }}</span>
                  <span v-if="index === 0" class="text-xs text-slate-500 dark:text-slate-400">当前版本</span>
                  <span v-if="version.isRollback" class="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><RotateCcw class="h-3.5 w-3.5" />回滚版本</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{ changeTypeLabel(version.changeType) }}</span>
                </div>
                <div class="text-sm leading-5 text-slate-600 dark:text-slate-300">{{ version.changeLog || '暂无版本说明' }}</div>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span class="inline-flex items-center gap-1.5"><Clock3 class="h-3.5 w-3.5" />{{ formatDateTime(version.createdAt) }}</span>
                  <span>操作人 {{ version.createdByName || version.createdBy || '未知' }}</span>
                  <span v-if="version.rollbackFromVersion">来源版本 v{{ version.rollbackFromVersion }}</span>
                </div>
              </div>
            </div>
            <Button v-if="index !== 0" variant="outline" size="sm" @click="openRollback(version)"><RotateCcw class="h-4 w-4" />回滚</Button>
          </div>
        </div>
      </div>
    </Panel>

    <BaseDialog :show="compareOpen && Boolean(comparison)" :title="comparison ? `版本对比：v${comparison.fromVersion} -> v${comparison.toVersion}` : '版本对比'" width="extra-wide" @close="compareOpen = false">
      <div v-if="comparison" class="space-y-4">
        <div class="grid gap-3 text-sm md:grid-cols-3">
          <div class="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">节点新增 {{ comparison.addedNodes?.length || 0 }}</div>
          <div class="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">节点删除 {{ comparison.removedNodes?.length || 0 }}</div>
          <div class="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">节点修改 {{ comparison.modifiedNodes?.length || 0 }}</div>
        </div>
        <EmptyState v-if="!hasDiff" title="两个版本没有结构差异" />
        <div v-else class="grid gap-4 lg:grid-cols-2">
          <Panel title="新增节点"><div class="space-y-2 text-sm"><div v-for="(node, index) in comparison.addedNodes || []" :key="`add-${index}`" class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">{{ formatNodeName(node) }}</div></div></Panel>
          <Panel title="删除节点"><div class="space-y-2 text-sm"><div v-for="(node, index) in comparison.removedNodes || []" :key="`remove-${index}`" class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">{{ formatNodeName(node) }}</div></div></Panel>
          <Panel title="修改节点"><div class="space-y-2 text-sm"><div v-for="(node, index) in comparison.modifiedNodes || []" :key="`modify-${index}`" class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">{{ formatNodeName(node) }}</div></div></Panel>
          <Panel title="连线变化"><div class="space-y-2 text-sm"><div v-for="(edge, index) in comparison.addedEdges || []" :key="`edge-add-${index}`" class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">新增 {{ formatEdge(edge) }}</div><div v-for="(edge, index) in comparison.removedEdges || []" :key="`edge-remove-${index}`" class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">删除 {{ formatEdge(edge) }}</div></div></Panel>
        </div>
      </div>
    </BaseDialog>

    <BaseDialog :show="rollbackOpen && Boolean(rollbackVersion)" :title="rollbackVersion ? `回滚到 v${rollbackVersion.versionNumber}` : '回滚版本'" width="normal" @close="rollbackOpen = false">
      <div v-if="rollbackVersion" class="space-y-4">
        <div class="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          <div>目标版本：v{{ rollbackVersion.versionNumber }}</div>
          <div class="mt-2">提交时间：{{ formatDateTime(rollbackVersion.createdAt) }}</div>
          <div class="mt-2">运行实例：{{ hasRunningInstances ? '需确认' : '未检测到' }}</div>
        </div>
        <label v-if="hasRunningInstances" class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input v-model="forceRollback" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-slate-900">强制回滚</label>
        <TextArea v-model="rollbackReason" label="回滚原因" :rows="4" required />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3"><Button variant="outline" @click="rollbackOpen = false">取消</Button><Button :disabled="saving" @click="submitRollback">确认回滚</Button></div>
      </template>
    </BaseDialog>
  </div>
</template>
