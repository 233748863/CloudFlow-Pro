<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeftRight, Eye, RefreshCcw, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Pagination,
  Panel,
  StatusBadge,
  type Column
} from '@/components/common'
import {
  type SysAuditLog,
  deleteAuditLogs,
  getAuditLogDetail,
  getAuditLogPage
} from '@/services/api/log'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, getTotal, normalizeRows } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const loading = ref(false)
const deleting = ref(false)
const records = ref<SysAuditLog[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const selectedIds = ref<number[]>([])
const detailLog = ref<SysAuditLog | null>(null)
const pendingDeleteIds = ref<number[]>([])

const filters = ref({
  auditName: '',
  auditField: '',
  createBy: '',
  startTime: '',
  endTime: ''
})

const query = ref({ ...filters.value })

const columns: Column<SysAuditLog>[] = [
  { key: 'select', label: '' },
  { key: 'auditId', label: 'ID', sortable: true },
  { key: 'auditName', label: '业务名称' },
  { key: 'auditField', label: '变更字段' },
  { key: 'beforeVal', label: '变更前' },
  { key: 'afterVal', label: '变更后' },
  { key: 'createBy', label: '操作人' },
  { key: 'createTime', label: '操作时间', sortable: true },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const allSelected = computed(() => records.value.length > 0 && records.value.every((item) => selectedIds.value.includes(item.auditId)))
const hasFilters = computed(() => Boolean(query.value.auditName || query.value.auditField || query.value.createBy || query.value.startTime || query.value.endTime))

const summary = computed(() => {
  const fields = new Set(records.value.map((item) => item.auditField).filter(Boolean))
  const operators = new Set(records.value.map((item) => item.createBy).filter(Boolean))
  const emptyBefore = records.value.filter((item) => !item.beforeVal).length
  return {
    total: total.value,
    fields: fields.size,
    operators: operators.size,
    created: emptyBefore
  }
})

function formatDateTime(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 19) : '-'
}

function valuePreview(value?: string | null) {
  return value && value.trim() ? value : '（空）'
}

function toggleSelect(id: number) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id]
}

function toggleAll() {
  selectedIds.value = allSelected.value ? [] : records.value.map((item) => item.auditId)
}

async function fetchLogs() {
  loading.value = true
  try {
    const page = await getAuditLogPage({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      auditName: query.value.auditName || undefined,
      auditField: query.value.auditField || undefined,
      createBy: query.value.createBy || undefined,
      startTime: query.value.startTime || undefined,
      endTime: query.value.endTime || undefined
    })
    records.value = normalizeRows<SysAuditLog>(page)
    total.value = getTotal<SysAuditLog>(page, records.value.length)
    selectedIds.value = []
  } catch (error) {
    records.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '审计日志加载失败'))
  } finally {
    loading.value = false
  }
}

function searchLogs() {
  query.value = {
    auditName: filters.value.auditName.trim(),
    auditField: filters.value.auditField.trim(),
    createBy: filters.value.createBy.trim(),
    startTime: filters.value.startTime,
    endTime: filters.value.endTime
  }
  pageNum.value = 1
  void fetchLogs()
}

function resetFilters() {
  filters.value = { auditName: '', auditField: '', createBy: '', startTime: '', endTime: '' }
  query.value = { ...filters.value }
  pageNum.value = 1
  void fetchLogs()
}

async function openDetail(row: SysAuditLog) {
  try {
    detailLog.value = await getAuditLogDetail(row.auditId)
  } catch (error) {
    toast.error(getErrorMessage(error, '审计详情加载失败'))
  }
}

function requestDelete(ids: number[]) {
  if (ids.length === 0) {
    toast.error('请选择要删除的审计日志')
    return
  }
  pendingDeleteIds.value = ids
}

async function confirmDelete() {
  if (pendingDeleteIds.value.length === 0) return
  deleting.value = true
  try {
    await deleteAuditLogs(pendingDeleteIds.value)
    const nextPage = records.value.length === pendingDeleteIds.value.length && pageNum.value > 1 ? pageNum.value - 1 : pageNum.value
    pendingDeleteIds.value = []
    pageNum.value = nextPage
    toast.success('删除成功')
    await fetchLogs()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除审计日志失败'))
  } finally {
    deleting.value = false
  }
}

watch([pageNum, pageSize], () => {
  void fetchLogs()
})

onMounted(() => {
  void fetchLogs()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <ShieldCheck class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Audit Log
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">审计日志</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">追踪关键业务字段变更，查看变更前后数据和操作人</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchLogs">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新列表
        </Button>
        <Button variant="danger" :disabled="selectedIds.length === 0 || deleting" @click="requestDelete(selectedIds)">
          <Trash2 class="h-4 w-4" />
          删除选中
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">审计总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">本页字段数</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.fields) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">本页操作人</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.operators) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">本页新增类变更</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.created) }}</div></div>
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_180px_180px_auto]">
        <Input v-model="filters.auditName" label="业务名称" placeholder="按业务名称模糊查询" @enter="searchLogs" />
        <Input v-model="filters.auditField" label="变更字段" placeholder="按字段名模糊查询" @enter="searchLogs" />
        <Input v-model="filters.createBy" label="操作人" placeholder="按用户模糊查询" @enter="searchLogs" />
        <Input v-model="filters.startTime" label="开始日期" type="date" />
        <Input v-model="filters.endTime" label="结束日期" type="date" />
        <div class="flex items-end gap-2">
          <Button @click="searchLogs"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel title="审计日志列表">
      <template #icon><ShieldCheck class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="records" :loading="loading" row-key="auditId">
        <template #header-select>
          <input class="h-4 w-4 rounded border-slate-300 accent-cyan-600" type="checkbox" :checked="allSelected" @change="toggleAll" />
        </template>
        <template #cell-select="{ row }">
          <input class="h-4 w-4 rounded border-slate-300 accent-cyan-600" type="checkbox" :checked="selectedIds.includes(row.auditId)" @change="toggleSelect(row.auditId)" />
        </template>
        <template #cell-auditId="{ row }"><span class="font-mono text-xs text-slate-500">#{{ row.auditId }}</span></template>
        <template #cell-auditName="{ row }">
          <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.auditName || '-' }}</div>
          <div class="text-xs text-slate-500">{{ formatDateTime(row.createTime) }}</div>
        </template>
        <template #cell-auditField="{ row }"><StatusBadge :label="row.auditField || '-'" tone="cyan" /></template>
        <template #cell-beforeVal="{ row }">
          <span class="block max-w-[240px] truncate text-slate-500" :title="row.beforeVal">{{ valuePreview(row.beforeVal) }}</span>
        </template>
        <template #cell-afterVal="{ row }">
          <span class="block max-w-[240px] truncate text-slate-700 dark:text-slate-200" :title="row.afterVal">{{ valuePreview(row.afterVal) }}</span>
        </template>
        <template #cell-createBy="{ row }"><span class="font-medium text-slate-900 dark:text-slate-100">{{ row.createBy || '-' }}</span></template>
        <template #cell-createTime="{ row }">{{ formatDateTime(row.createTime) }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openDetail(row)"><Eye class="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" @click="requestDelete([row.auditId])"><Trash2 class="h-4 w-4 text-red-500" /></Button>
          </div>
        </template>
      </DataTable>
      <Pagination
        v-if="total > 0"
        v-model:page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        @update:page-size="pageNum = 1"
      />
    </Panel>

    <BaseDialog :show="Boolean(detailLog)" title="审计详情" width="extra-wide" @close="detailLog = null">
      <div v-if="detailLog" class="space-y-4">
        <div class="grid gap-3 md:grid-cols-3">
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div class="text-xs text-slate-500">业务名称</div>
            <div class="mt-2 break-all text-sm font-medium text-slate-900 dark:text-slate-100">{{ detailLog.auditName || '-' }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div class="text-xs text-slate-500">操作人</div>
            <div class="mt-2 break-all text-sm font-medium text-slate-900 dark:text-slate-100">{{ detailLog.createBy || '-' }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div class="text-xs text-slate-500">操作时间</div>
            <div class="mt-2 text-sm text-slate-700 dark:text-slate-200">{{ formatDateTime(detailLog.createTime) }}</div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-slate-500">变更字段</span>
            <StatusBadge :label="detailLog.auditField || '-'" tone="cyan" />
          </div>
        </div>

        <div class="grid overflow-hidden rounded-xl border border-slate-200 md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] dark:border-slate-800">
          <div class="bg-slate-50/70 dark:bg-slate-900/40">
            <div class="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">变更前</div>
            <pre class="min-h-[180px] whitespace-pre-wrap break-all p-4 text-sm leading-7 text-slate-700 dark:text-slate-200">{{ valuePreview(detailLog.beforeVal) }}</pre>
          </div>
          <div class="flex items-center justify-center border-y border-slate-200 bg-slate-50 md:border-x md:border-y-0 dark:border-slate-800 dark:bg-slate-900/70">
            <ArrowLeftRight class="h-5 w-5 text-slate-400" />
          </div>
          <div class="bg-slate-50/70 dark:bg-slate-900/40">
            <div class="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">变更后</div>
            <pre class="min-h-[180px] whitespace-pre-wrap break-all p-4 text-sm leading-7 text-slate-700 dark:text-slate-200">{{ valuePreview(detailLog.afterVal) }}</pre>
          </div>
        </div>
      </div>
    </BaseDialog>

    <ConfirmDialog
      :show="pendingDeleteIds.length > 0"
      title="删除审计日志"
      :message="pendingDeleteIds.length > 1 ? `确认删除选中的 ${pendingDeleteIds.length} 条审计日志？删除后将无法恢复。` : '确认删除这条审计日志？删除后将无法恢复。'"
      confirm-text="删除"
      danger
      @cancel="pendingDeleteIds = []"
      @confirm="confirmDelete"
    />
  </div>
</template>
