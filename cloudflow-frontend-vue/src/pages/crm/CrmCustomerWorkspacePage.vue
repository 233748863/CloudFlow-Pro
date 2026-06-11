<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BriefcaseBusiness, CircleDollarSign, FileText, RefreshCcw, UserRound } from 'lucide-vue-next'
import { Button, DataTable, EmptyState, Panel, StatCard, type Column } from '@/components/common'
import request from '@/services/api/request'
import type { ApiRecord } from '@/services/api/page'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

const route = useRoute()
const toast = useToastStore()
const loading = ref(false)
const workspace = ref<ApiRecord | null>(null)

const customerId = computed(() => String(route.params.customerId || ''))
const customer = computed(() => (workspace.value?.customer || workspace.value || {}) as ApiRecord)
const relatedRows = computed<ApiRecord[]>(() => {
  const source = workspace.value || {}
  return [
    ...normalizeRows(source.contracts, '合同'),
    ...normalizeRows(source.projects, '项目'),
    ...normalizeRows(source.invoices, '发票'),
    ...normalizeRows(source.receivables, '应收')
  ]
})

const columns: Column<ApiRecord>[] = [
  { key: 'module', label: '模块' },
  { key: 'name', label: '名称/编号' },
  { key: 'amount', label: '金额' },
  { key: 'status', label: '状态' }
]

function normalizeRows(value: unknown, module: string) {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const row = (item || {}) as ApiRecord
    return {
      id: `${module}-${row.id || row.contractId || row.projectId || row.invoiceId || row.receivableId || index}`,
      module,
      name: row.contractName || row.projectName || row.invoiceNo || row.receivableNo || row.name || row.title || '-',
      amount: row.amount || row.totalAmount || row.grossAmount || '-',
      status: row.status || '-'
    }
  })
}

async function fetchWorkspace() {
  if (!customerId.value) return
  loading.value = true
  try {
    workspace.value = await request.get(`/crm/customer/${customerId.value}/workspace`)
  } catch (error) {
    workspace.value = null
    toast.error(getErrorMessage(error, '客户工作台加载失败'))
  } finally {
    loading.value = false
  }
}

function formatAmount(value: unknown) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount)
}

watch(customerId, () => void fetchWorkspace())
onMounted(() => void fetchWorkspace())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          <UserRound class="h-3.5 w-3.5 text-teal-600" />
          CRM Workspace
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {{ customer.customerName || `客户 #${customerId}` }}
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">客户合同、项目、发票和应收的集中工作台。</p>
      </div>
      <Button variant="outline" :disabled="loading" @click="fetchWorkspace">
        <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <StatCard title="客户等级" :value="String(customer.level || '-')" />
      <StatCard title="负责人" :value="String(customer.ownerName || '-')" />
      <StatCard title="合同额" :value="formatAmount(workspace?.contractAmount)" />
      <StatCard title="应收额" :value="formatAmount(workspace?.receivableAmount)" />
    </div>

    <Panel title="关联业务">
      <template #icon><BriefcaseBusiness class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="relatedRows" :loading="loading" row-key="id">
        <template #empty>
          <EmptyState title="暂无关联业务" description="该客户暂未关联合同、项目、发票或应收记录。" />
        </template>
      </DataTable>
    </Panel>

    <div class="grid gap-4 lg:grid-cols-3">
      <Panel title="合同草稿">
        <template #icon><FileText class="h-4 w-4 text-slate-500" /></template>
        <p class="text-sm leading-6 text-slate-500">从报价或商机生成合同草稿后，会在此工作台关联展示。</p>
      </Panel>
      <Panel title="项目草稿">
        <template #icon><BriefcaseBusiness class="h-4 w-4 text-slate-500" /></template>
        <p class="text-sm leading-6 text-slate-500">项目、WBS、预算和风险项围绕客户统一追踪。</p>
      </Panel>
      <Panel title="收款核销">
        <template #icon><CircleDollarSign class="h-4 w-4 text-slate-500" /></template>
        <p class="text-sm leading-6 text-slate-500">发票绑定与应收确认沿用后端 `/crm/customer/:id/workspace/*` 接口。</p>
      </Panel>
    </div>
  </div>
</template>
