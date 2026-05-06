<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Activity, Eye, LogIn, RefreshCcw, RotateCcw, Search, Trash2 } from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Pagination,
  Panel,
  Select,
  StatusBadge,
  type Column,
  type SelectOption
} from '@/components/common'
import {
  type LogTrendItem,
  type SysLog,
  deleteLoginLogs,
  deleteSysLogs,
  getLoginLogDetail,
  getLoginLogPage,
  getLoginLogTrend,
  getSysLogDetail,
  getSysLogPage,
  getSysLogTrend
} from '@/services/api/log'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, getTotal, normalizeRows } from '@/pages/hr/hrUtils'

type LogMode = 'operation' | 'login'

const route = useRoute()
const toast = useToastStore()
const loading = ref(false)
const trendLoading = ref(false)
const deleting = ref(false)
const records = ref<SysLog[]>([])
const trend = ref<LogTrendItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const selectedIds = ref<number[]>([])
const detailLog = ref<SysLog | null>(null)
const pendingDeleteIds = ref<number[]>([])

const filters = ref({
  title: '',
  createBy: '',
  remoteAddr: '',
  logType: '',
  startTime: '',
  endTime: ''
})

const query = ref({ ...filters.value })

const mode = computed<LogMode>(() => route.path === '/system/login-log' ? 'login' : 'operation')
const isLoginMode = computed(() => mode.value === 'login')

const columns = computed<Column<SysLog>[]>(() => isLoginMode.value
  ? [
      { key: 'select', label: '' },
      { key: 'createBy', label: '用户' },
      { key: 'logType', label: '状态' },
      { key: 'remoteAddr', label: '客户端 IP' },
      { key: 'time', label: '耗时', sortable: true },
      { key: 'userAgent', label: '浏览器' },
      { key: 'createTime', label: '登录时间', sortable: true },
      { key: 'actions', label: '操作', class: 'text-right' }
    ]
  : [
      { key: 'select', label: '' },
      { key: 'logId', label: 'ID', sortable: true },
      { key: 'logType', label: '类型' },
      { key: 'title', label: '操作标题' },
      { key: 'remoteAddr', label: 'IP 地址' },
      { key: 'method', label: '方法' },
      { key: 'time', label: '耗时', sortable: true },
      { key: 'createBy', label: '操作人' },
      { key: 'createTime', label: '操作时间', sortable: true },
      { key: 'actions', label: '操作', class: 'text-right' }
    ])

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '正常/成功' },
  { value: '9', label: '错误/失败' }
]

const pageMeta = computed(() => ({
  eyebrow: isLoginMode.value ? 'Login Log' : 'Operation Log',
  title: isLoginMode.value ? '登录日志' : '操作日志',
  description: isLoginMode.value ? '追踪登录来源、客户端、耗时与失败信息' : '追踪系统操作、接口请求、耗时与异常信息'
}))

const summary = computed(() => {
  const success = records.value.filter((item) => item.logType !== '9').length
  const fail = records.value.filter((item) => item.logType === '9').length
  const avgTime = records.value.length
    ? Math.round(records.value.reduce((sum, item) => sum + Number(item.time || 0), 0) / records.value.length)
    : 0
  return { total: total.value, success, fail, avgTime }
})

const allSelected = computed(() => records.value.length > 0 && records.value.every((item) => selectedIds.value.includes(item.logId)))
const hasFilters = computed(() => Boolean(query.value.title || query.value.createBy || query.value.remoteAddr || query.value.logType || query.value.startTime || query.value.endTime))
const maxTrend = computed(() => Math.max(...trend.value.map((item) => Math.max(Number(item.success || 0), Number(item.fail || 0))), 1))

function statusLabel(logType?: string) {
  if (isLoginMode.value) return logType === '9' ? '失败' : '成功'
  return logType === '9' ? '错误' : '正常'
}

function statusTone(logType?: string) {
  return logType === '9' ? 'red' : 'green'
}

function formatDateTime(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 19) : '-'
}

function formatDuration(value?: number | null) {
  const duration = Number(value || 0)
  return duration > 0 ? `${formatNumber(duration)} ms` : '-'
}

function toggleSelect(id: number) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id]
}

function toggleAll() {
  selectedIds.value = allSelected.value ? [] : records.value.map((item) => item.logId)
}

async function fetchLogs() {
  loading.value = true
  try {
    const params = {
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      title: !isLoginMode.value && query.value.title ? query.value.title : undefined,
      createBy: query.value.createBy || undefined,
      remoteAddr: isLoginMode.value && query.value.remoteAddr ? query.value.remoteAddr : undefined,
      logType: query.value.logType || undefined,
      startTime: query.value.startTime || undefined,
      endTime: query.value.endTime || undefined
    }
    const page = isLoginMode.value ? await getLoginLogPage(params) : await getSysLogPage(params)
    records.value = normalizeRows<SysLog>(page)
    total.value = getTotal<SysLog>(page, records.value.length)
    selectedIds.value = []
  } catch (error) {
    records.value = []
    total.value = 0
    toast.error(getErrorMessage(error, `${pageMeta.value.title}加载失败`))
  } finally {
    loading.value = false
  }
}

async function fetchTrend() {
  trendLoading.value = true
  try {
    trend.value = isLoginMode.value ? await getLoginLogTrend() : await getSysLogTrend()
  } catch (error) {
    trend.value = []
    toast.error(getErrorMessage(error, '趋势数据加载失败'))
  } finally {
    trendLoading.value = false
  }
}

function searchLogs() {
  query.value = {
    title: filters.value.title.trim(),
    createBy: filters.value.createBy.trim(),
    remoteAddr: filters.value.remoteAddr.trim(),
    logType: filters.value.logType,
    startTime: filters.value.startTime,
    endTime: filters.value.endTime
  }
  pageNum.value = 1
  void fetchLogs()
}

function resetFilters() {
  filters.value = { title: '', createBy: '', remoteAddr: '', logType: '', startTime: '', endTime: '' }
  query.value = { ...filters.value }
  pageNum.value = 1
  void fetchLogs()
}

async function openDetail(log: SysLog) {
  try {
    detailLog.value = isLoginMode.value ? await getLoginLogDetail(log.logId) : await getSysLogDetail(log.logId)
  } catch (error) {
    toast.error(getErrorMessage(error, '日志详情加载失败'))
  }
}

function requestDelete(ids: number[]) {
  if (ids.length === 0) {
    toast.error('请选择要删除的日志')
    return
  }
  pendingDeleteIds.value = ids
}

async function confirmDelete() {
  if (pendingDeleteIds.value.length === 0) return
  deleting.value = true
  try {
    if (isLoginMode.value) await deleteLoginLogs(pendingDeleteIds.value)
    else await deleteSysLogs(pendingDeleteIds.value)
    const nextPage = records.value.length === pendingDeleteIds.value.length && pageNum.value > 1 ? pageNum.value - 1 : pageNum.value
    pendingDeleteIds.value = []
    pageNum.value = nextPage
    toast.success('删除成功')
    await Promise.all([fetchLogs(), fetchTrend()])
  } catch (error) {
    toast.error(getErrorMessage(error, '删除日志失败'))
  } finally {
    deleting.value = false
  }
}

watch([pageNum, pageSize], () => {
  void fetchLogs()
})

watch(mode, () => {
  filters.value = { title: '', createBy: '', remoteAddr: '', logType: '', startTime: '', endTime: '' }
  query.value = { ...filters.value }
  pageNum.value = 1
  detailLog.value = null
  pendingDeleteIds.value = []
  void Promise.all([fetchLogs(), fetchTrend()])
})

onMounted(() => {
  void Promise.all([fetchLogs(), fetchTrend()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <LogIn v-if="isLoginMode" class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          <Activity v-else class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          {{ pageMeta.eyebrow }}
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{{ pageMeta.title }}</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ pageMeta.description }}</p>
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
      <div class="card p-4"><div class="text-xs text-slate-500">日志总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">本页正常</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.success) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">本页异常</div><div class="mt-2 text-2xl font-semibold text-red-600 dark:text-red-300">{{ formatNumber(summary.fail) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">平均耗时</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatDuration(summary.avgTime) }}</div></div>
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_180px_180px_auto]">
        <Input v-if="!isLoginMode" v-model="filters.title" label="操作标题" placeholder="按标题模糊查询" @enter="searchLogs" />
        <Input v-else v-model="filters.remoteAddr" label="客户端 IP" placeholder="按 IP 模糊查询" @enter="searchLogs" />
        <Input v-model="filters.createBy" label="操作人" placeholder="按用户模糊查询" @enter="searchLogs" />
        <label class="space-y-2">
          <span class="text-sm font-medium">状态</span>
          <Select v-model="filters.logType" :options="statusOptions" />
        </label>
        <Input v-model="filters.startTime" label="开始日期" type="date" />
        <Input v-model="filters.endTime" label="结束日期" type="date" />
        <div class="flex items-end gap-2">
          <Button @click="searchLogs"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel title="近 30 天趋势">
      <template #icon><Activity class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <Button size="sm" variant="outline" :disabled="trendLoading" @click="fetchTrend">
          <RefreshCcw class="h-4 w-4" :class="trendLoading ? 'animate-spin' : ''" />
          刷新趋势
        </Button>
      </template>
      <div v-if="trendLoading" class="py-12 text-center text-sm text-slate-500">正在加载趋势数据...</div>
      <div v-else-if="trend.length === 0" class="py-12 text-center text-sm text-slate-500">暂无趋势数据</div>
      <div v-else class="overflow-x-auto">
        <div class="flex min-w-[760px] items-end gap-1 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div v-for="item in trend" :key="item.date" class="flex min-w-5 flex-1 flex-col items-center gap-1">
            <div class="flex h-32 w-full items-end justify-center gap-1">
              <div class="w-2 rounded-t bg-cyan-500" :style="{ height: `${Math.max((Number(item.success || 0) / maxTrend) * 100, item.success ? 4 : 0)}%` }" />
              <div class="w-2 rounded-t bg-red-400" :style="{ height: `${Math.max((Number(item.fail || 0) / maxTrend) * 100, item.fail ? 4 : 0)}%` }" />
            </div>
            <span class="text-[10px] text-slate-400">{{ item.date.slice(5) }}</span>
          </div>
        </div>
        <div class="mt-3 flex justify-end gap-4 text-xs text-slate-500">
          <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-cyan-500" />成功</span>
          <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-red-400" />失败</span>
        </div>
      </div>
    </Panel>

    <Panel :title="`${pageMeta.title}列表`">
      <template #icon><Activity class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="records" :loading="loading" row-key="logId">
        <template #cell-select="{ row }">
          <input class="h-4 w-4 rounded border-slate-300 accent-cyan-600" type="checkbox" :checked="selectedIds.includes(row.logId)" @change="toggleSelect(row.logId)" />
        </template>
        <template #header-select>
          <input class="h-4 w-4 rounded border-slate-300 accent-cyan-600" type="checkbox" :checked="allSelected" @change="toggleAll" />
        </template>
        <template #cell-logId="{ row }"><span class="font-mono text-xs text-slate-500">#{{ row.logId }}</span></template>
        <template #cell-logType="{ row }"><StatusBadge :label="statusLabel(row.logType)" :tone="statusTone(row.logType)" /></template>
        <template #cell-title="{ row }">
          <div class="font-medium text-slate-900 dark:text-slate-100">{{ row.title || '-' }}</div>
          <div class="max-w-[260px] truncate text-xs text-slate-500">{{ row.requestUri || '-' }}</div>
        </template>
        <template #cell-createBy="{ row }"><span class="font-medium text-slate-900 dark:text-slate-100">{{ row.createBy || '-' }}</span></template>
        <template #cell-time="{ row }">{{ formatDuration(row.time) }}</template>
        <template #cell-userAgent="{ row }"><span class="block max-w-[280px] truncate" :title="row.userAgent">{{ row.userAgent || '-' }}</span></template>
        <template #cell-createTime="{ row }">{{ formatDateTime(row.createTime) }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openDetail(row)"><Eye class="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" @click="requestDelete([row.logId])"><Trash2 class="h-4 w-4 text-red-500" /></Button>
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

    <BaseDialog :show="Boolean(detailLog)" :title="`${pageMeta.title}详情`" width="extra-wide" @close="detailLog = null">
      <div v-if="detailLog" class="space-y-4">
        <div class="grid gap-3 md:grid-cols-2">
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div class="text-xs text-slate-500">状态</div><StatusBadge class="mt-2" :label="statusLabel(detailLog.logType)" :tone="statusTone(detailLog.logType)" /></div>
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div class="text-xs text-slate-500">时间</div><div class="mt-2 text-sm">{{ formatDateTime(detailLog.createTime) }}</div></div>
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div class="text-xs text-slate-500">操作人</div><div class="mt-2 break-all text-sm">{{ detailLog.createBy || '-' }}</div></div>
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div class="text-xs text-slate-500">IP 地址</div><div class="mt-2 break-all text-sm">{{ detailLog.remoteAddr || '-' }}</div></div>
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div class="text-xs text-slate-500">请求地址</div><div class="mt-2 break-all text-sm">{{ detailLog.requestUri || '-' }}</div></div>
          <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div class="text-xs text-slate-500">请求方法/耗时</div><div class="mt-2 text-sm">{{ detailLog.method || '-' }} / {{ formatDuration(detailLog.time) }}</div></div>
        </div>
        <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div class="text-xs text-slate-500">User Agent</div>
          <div class="mt-2 break-all text-sm">{{ detailLog.userAgent || '-' }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div class="text-xs text-slate-500">请求参数</div>
          <pre class="mt-2 whitespace-pre-wrap break-all text-sm">{{ detailLog.params || '-' }}</pre>
        </div>
        <div v-if="detailLog.exception" class="rounded-xl border border-red-200 bg-red-50/60 p-4 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">
          <div class="text-xs">异常信息</div>
          <pre class="mt-2 whitespace-pre-wrap break-all text-sm">{{ detailLog.exception }}</pre>
        </div>
      </div>
    </BaseDialog>

    <ConfirmDialog
      :show="pendingDeleteIds.length > 0"
      :title="`删除${pageMeta.title}`"
      :message="pendingDeleteIds.length > 1 ? `确认删除选中的 ${pendingDeleteIds.length} 条日志？删除后将无法恢复。` : '确认删除这条日志？删除后将无法恢复。'"
      confirm-text="删除"
      danger
      @cancel="pendingDeleteIds = []"
      @confirm="confirmDelete"
    />
  </div>
</template>
