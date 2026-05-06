<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BadgeCheck, RefreshCcw, RotateCcw, Search, Stamp } from 'lucide-vue-next'
import { Button, DataTable, Panel, StatCard, StatusBadge, type Column } from '@/components/common'
import {
  getBorrowStats,
  getBorrowSummary,
  listOaPage,
  normalizeOaRows,
  type OaBorrowStats,
  type OaBorrowSummary,
  type OaRecord
} from '@/services/api/oa'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'
import { statusTone } from '@/pages/admin/adminPageConfigs'

const toast = useToastStore()
const loading = ref(false)
const summary = ref<OaBorrowSummary>({})
const stats = ref<OaBorrowStats>({})
const sealRows = ref<OaRecord[]>([])
const licenseRows = ref<OaRecord[]>([])

const sealColumns: Column<OaRecord>[] = [
  { key: 'applicationNo', label: '申请编号' },
  { key: 'sealName', label: '印章' },
  { key: 'documentName', label: '文件' },
  { key: 'userName', label: '申请人' },
  { key: 'expectedReturnTime', label: '预计归还' },
  { key: 'status', label: '状态' }
]

const licenseColumns: Column<OaRecord>[] = [
  { key: 'borrowNo', label: '借用编号' },
  { key: 'licenseName', label: '证照' },
  { key: 'userName', label: '借用人' },
  { key: 'deptName', label: '部门' },
  { key: 'expectedReturnTime', label: '预计归还' },
  { key: 'status', label: '状态' }
]

const cards = computed(() => [
  { title: '印章借出中', value: summary.value.sealBorrowing ?? 0 },
  { title: '证照借出中', value: summary.value.licenseBorrowing ?? 0 },
  { title: '逾期待催还', value: Number(summary.value.sealOverdue ?? 0) + Number(summary.value.licenseOverdue ?? 0) },
  { title: '待交接', value: summary.value.pendingHandover ?? stats.value.reminders ?? 0 }
])

function formatDateTime(value: unknown) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
}

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    DRAFT: '草稿',
    PENDING: '审批中',
    APPROVED: '已通过',
    BORROWED: '已借出',
    RETURNED: '已归还',
    REJECTED: '已拒绝',
    CANCELLED: '已取消'
  }
  return labels[String(value ?? '').toUpperCase()] || String(value ?? '-')
}

async function fetchAll() {
  loading.value = true
  try {
    const [summaryData, statsData, seals, licenses] = await Promise.all([
      getBorrowSummary().catch(() => ({})),
      getBorrowStats().catch(() => ({})),
      listOaPage('/oa/seal/application', { pageNum: 1, pageSize: 8 }).catch(() => []),
      listOaPage('/oa/license/borrow', { pageNum: 1, pageSize: 8 }).catch(() => [])
    ])
    summary.value = summaryData
    stats.value = statsData
    sealRows.value = normalizeOaRows(seals)
    licenseRows.value = normalizeOaRows(licenses)
  } catch (error) {
    toast.error(getErrorMessage(error, '借还管理数据加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(() => void fetchAll())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <RotateCcw class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Borrow Management
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">借还管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">聚合印章与证照借出、归还、逾期和交接状态</p>
      </div>
      <Button variant="outline" :disabled="loading" @click="fetchAll">
        <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <StatCard v-for="card in cards" :key="card.title" :title="card.title" :value="formatNumber(card.value)" />
    </div>

    <Panel title="当前处理概览">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-3">
        <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div class="text-xs text-slate-500">印章申请数</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ formatNumber(stats.sealApplications ?? sealRows.length) }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div class="text-xs text-slate-500">证照借用数</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ formatNumber(stats.licenseBorrows ?? licenseRows.length) }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div class="text-xs text-slate-500">逾期总数</div>
          <div class="mt-2 text-2xl font-semibold text-red-600 dark:text-red-300">{{ formatNumber(stats.totalOverdue ?? 0) }}</div>
        </div>
      </div>
    </Panel>

    <div class="grid gap-4 xl:grid-cols-2">
      <Panel title="用印借还">
        <template #icon><Stamp class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="sealColumns" :data="sealRows" :loading="loading" row-key="id">
          <template #cell-applicationNo="{ value }"><span class="font-mono text-xs text-slate-500">{{ value || '-' }}</span></template>
          <template #cell-documentName="{ value }"><span class="font-semibold text-slate-900 dark:text-slate-100">{{ value || '-' }}</span></template>
          <template #cell-expectedReturnTime="{ value }">{{ formatDateTime(value) }}</template>
          <template #cell-status="{ value }"><StatusBadge :label="statusLabel(value)" :tone="statusTone(value)" /></template>
        </DataTable>
      </Panel>

      <Panel title="证照借还">
        <template #icon><BadgeCheck class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="licenseColumns" :data="licenseRows" :loading="loading" row-key="id">
          <template #cell-borrowNo="{ value }"><span class="font-mono text-xs text-slate-500">{{ value || '-' }}</span></template>
          <template #cell-licenseName="{ value }"><span class="font-semibold text-slate-900 dark:text-slate-100">{{ value || '-' }}</span></template>
          <template #cell-expectedReturnTime="{ value }">{{ formatDateTime(value) }}</template>
          <template #cell-status="{ value }"><StatusBadge :label="statusLabel(value)" :tone="statusTone(value)" /></template>
        </DataTable>
      </Panel>
    </div>
  </div>
</template>
