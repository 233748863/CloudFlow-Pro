<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Building2, Edit3, HardDrive, Plus, Power, RefreshCcw, RotateCcw, Save, Search, Trash2, Users } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, Input, Pagination, Panel, Select, StatusBadge, TextArea, type Column, type SelectOption } from '@/components/common'
import { type SysTenant, addTenant, changeTenantStatus, deleteTenant, getTenantList, getTenantStatisticsBatch, refreshTenantStorageUsage, updateTenant } from '@/services/api/systemManage'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, getTotal, normalizeRows } from '@/pages/hr/hrUtils'

interface TenantView extends SysTenant { userCount?: number; expired?: boolean; userLimitReached?: boolean; disabled?: boolean }

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const tenants = ref<TenantView[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const dialogOpen = ref(false)
const editingTenant = ref<TenantView | null>(null)
const pendingDelete = ref<TenantView | null>(null)
const refreshingTenantId = ref<number | null>(null)
const filters = ref({ tenantName: '', tenantCode: '', contactName: '', status: '' })
const query = ref({ ...filters.value })
const form = ref<SysTenant>({ tenantCode: '', tenantName: '', contactName: '', contactPhone: '', contactEmail: '', domain: '', status: '0', userLimit: 100, storageLimit: 10240, storageUsed: 0, expireTime: '', remark: '' })

const columns: Column<TenantView>[] = [
  { key: 'tenantName', label: '租户' },
  { key: 'contactName', label: '联系人' },
  { key: 'quota', label: '配额' },
  { key: 'expireTime', label: '到期时间', sortable: true },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]
const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '停用' }
]
const formStatusOptions = statusOptions.slice(1)
const summary = computed(() => ({
  total: total.value,
  active: tenants.value.filter((item) => item.status === '0' && !item.expired).length,
  disabled: tenants.value.filter((item) => item.status === '1').length,
  warning: tenants.value.filter((item) => item.expired || item.userLimitReached || usagePercent(item.storageUsed, item.storageLimit) >= 80).length
}))
const hasFilters = computed(() => Boolean(query.value.tenantName || query.value.tenantCode || query.value.contactName || query.value.status))
const dialogTitle = computed(() => editingTenant.value ? '编辑租户' : '新增租户')

function statusLabel(status?: string) { return status === '1' ? '停用' : '正常' }
function statusTone(status?: string) { return status === '1' ? 'red' : 'green' }
function formatDate(value?: string | null) { return value ? String(value).replace('T', ' ').slice(0, 10) : '-' }
function formatStorage(mb?: number) { const value = Number(mb || 0); return value >= 1024 ? `${(value / 1024).toFixed(2)} GB` : `${formatNumber(value)} MB` }
function usagePercent(used?: number, limit?: number) { return Number(limit || 0) > 0 ? Math.min((Number(used || 0) / Number(limit)) * 100, 100) : 0 }
function expiredByDate(value?: string) { const time = value ? new Date(value).getTime() : 0; return Boolean(time && !Number.isNaN(time) && time < Date.now()) }

async function fetchTenants() {
  loading.value = true
  try {
    const page = await getTenantList({ pageNum: pageNum.value, pageSize: pageSize.value, tenantName: query.value.tenantName || undefined, tenantCode: query.value.tenantCode || undefined, contactName: query.value.contactName || undefined, status: query.value.status || undefined })
    const rows = normalizeRows<SysTenant>(page)
    const stats = await getTenantStatisticsBatch(rows.map((item) => item.tenantId).filter(Boolean) as number[]).catch(() => [])
    tenants.value = rows.map((tenant) => {
      const stat = stats.find((item) => item.tenantId === tenant.tenantId)
      return { ...tenant, status: tenant.status || '0', userCount: stat?.userCount ?? tenant.accountCount ?? 0, expired: stat?.expired ?? expiredByDate(tenant.expireTime), userLimitReached: stat?.userLimitReached ?? false, disabled: stat?.disabled ?? tenant.status === '1' }
    })
    total.value = getTotal<SysTenant>(page, tenants.value.length)
  } catch (error) {
    tenants.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '租户列表加载失败'))
  } finally {
    loading.value = false
  }
}
function searchTenants() { query.value = { tenantName: filters.value.tenantName.trim(), tenantCode: filters.value.tenantCode.trim(), contactName: filters.value.contactName.trim(), status: filters.value.status }; pageNum.value = 1; void fetchTenants() }
function resetFilters() { filters.value = { tenantName: '', tenantCode: '', contactName: '', status: '' }; query.value = { ...filters.value }; pageNum.value = 1; void fetchTenants() }
function openDialog(tenant?: TenantView) {
  editingTenant.value = tenant || null
  form.value = { tenantId: tenant?.tenantId, tenantCode: tenant?.tenantCode || '', tenantName: tenant?.tenantName || '', contactName: tenant?.contactName || '', contactPhone: tenant?.contactPhone || '', contactEmail: tenant?.contactEmail || '', domain: tenant?.domain || '', status: tenant?.status || '0', userLimit: Number(tenant?.userLimit || 100), storageLimit: Number(tenant?.storageLimit || 10240), storageUsed: Number(tenant?.storageUsed || 0), expireTime: tenant?.expireTime ? String(tenant.expireTime).slice(0, 10) : '', remark: tenant?.remark || '' }
  dialogOpen.value = true
}
function closeDialog() { dialogOpen.value = false; editingTenant.value = null }
async function saveTenant() {
  if (!form.value.tenantCode?.trim()) return toast.error('请输入租户编码')
  if (!form.value.tenantName.trim()) return toast.error('请输入租户名称')
  saving.value = true
  try {
    const payload = { ...form.value, tenantCode: form.value.tenantCode.trim(), tenantName: form.value.tenantName.trim(), userLimit: Number(form.value.userLimit || 100), storageLimit: Number(form.value.storageLimit || 10240) }
    if (editingTenant.value?.tenantId) await updateTenant({ ...payload, tenantId: editingTenant.value.tenantId })
    else await addTenant(payload)
    closeDialog()
    toast.success('保存成功')
    await fetchTenants()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存租户失败'))
  } finally {
    saving.value = false
  }
}
async function toggleStatus(tenant: TenantView) {
  if (!tenant.tenantId) return
  try {
    await changeTenantStatus(tenant.tenantId, tenant.status === '0' ? '1' : '0')
    toast.success('状态已更新')
    await fetchTenants()
  } catch (error) {
    toast.error(getErrorMessage(error, '更新状态失败'))
  }
}
async function refreshStorage(tenant: TenantView) {
  if (!tenant.tenantId) return
  refreshingTenantId.value = tenant.tenantId
  try {
    await refreshTenantStorageUsage(tenant.tenantId)
    toast.success('存储使用量已刷新')
    await fetchTenants()
  } catch (error) {
    toast.error(getErrorMessage(error, '刷新存储失败'))
  } finally {
    refreshingTenantId.value = null
  }
}
async function confirmDelete() {
  if (!pendingDelete.value?.tenantId) return
  try {
    await deleteTenant(pendingDelete.value.tenantId)
    pendingDelete.value = null
    toast.success('删除成功')
    await fetchTenants()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除租户失败'))
  }
}

watch([pageNum, pageSize], () => void fetchTenants())
onMounted(() => void fetchTenants())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div><div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"><Building2 class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />System Tenant</div><h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">租户管理</h1><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">维护租户编码、联系人、配额、状态和到期时间</p></div>
      <div class="flex flex-wrap gap-2"><Button variant="outline" :disabled="loading" @click="fetchTenants"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button><Button @click="openDialog()"><Plus class="h-4 w-4" />新增租户</Button></div>
    </div>
    <div class="grid gap-4 md:grid-cols-4"><div class="card p-4"><div class="text-xs text-slate-500">租户总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div><div class="card p-4"><div class="text-xs text-slate-500">正常租户</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.active) }}</div></div><div class="card p-4"><div class="text-xs text-slate-500">停用租户</div><div class="mt-2 text-2xl font-semibold text-red-600 dark:text-red-300">{{ formatNumber(summary.disabled) }}</div></div><div class="card p-4"><div class="text-xs text-slate-500">需关注</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.warning) }}</div></div></div>
    <Panel title="筛选条件"><template #icon><Search class="h-4 w-4 text-slate-500" /></template><div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_220px_auto]"><Input v-model="filters.tenantName" label="租户名称" @enter="searchTenants" /><Input v-model="filters.tenantCode" label="租户编码" @enter="searchTenants" /><Input v-model="filters.contactName" label="联系人" @enter="searchTenants" /><label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="filters.status" :options="statusOptions" /></label><div class="flex items-end gap-2"><Button @click="searchTenants"><Search class="h-4 w-4" />查询</Button><Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button></div></div></Panel>
    <Panel title="租户列表">
      <template #icon><Building2 class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="tenants" :loading="loading" row-key="tenantId">
        <template #cell-tenantName="{ row }"><div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.tenantName }}</div><div class="text-xs text-slate-500">{{ row.tenantCode || '-' }} / ID {{ row.tenantId }}</div></template>
        <template #cell-contactName="{ row }"><div>{{ row.contactName || '-' }}</div><div class="text-xs text-slate-500">{{ row.contactPhone || row.contactEmail || '-' }}</div></template>
        <template #cell-quota="{ row }"><div class="space-y-1 text-sm"><div class="inline-flex items-center gap-1"><Users class="h-3.5 w-3.5" />{{ formatNumber(row.userCount) }} / {{ formatNumber(row.userLimit) }} 用户</div><div class="inline-flex items-center gap-1"><HardDrive class="h-3.5 w-3.5" />{{ formatStorage(row.storageUsed) }} / {{ formatStorage(row.storageLimit) }}</div></div></template>
        <template #cell-expireTime="{ row }"><span :class="row.expired ? 'text-red-600 dark:text-red-300' : ''">{{ formatDate(row.expireTime) }}</span></template>
        <template #cell-status="{ row }"><div class="flex flex-wrap gap-1"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" /><StatusBadge v-if="row.expired" label="已过期" tone="red" /></div></template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button size="icon" variant="ghost" @click="openDialog(row)"><Edit3 class="h-4 w-4" /></Button><Button size="icon" variant="ghost" @click="toggleStatus(row)"><Power class="h-4 w-4" /></Button><Button size="icon" variant="ghost" :disabled="refreshingTenantId === row.tenantId" @click="refreshStorage(row)"><RefreshCcw class="h-4 w-4" :class="refreshingTenantId === row.tenantId ? 'animate-spin' : ''" /></Button><Button size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button></div></template>
      </DataTable>
      <Pagination v-if="total > 0" v-model:page="pageNum" v-model:page-size="pageSize" :total="total" @update:page-size="pageNum = 1" />
    </Panel>
    <BaseDialog :show="dialogOpen" :title="dialogTitle" width="extra-wide" @close="closeDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <Input v-model="form.tenantCode" label="租户编码" required /><Input v-model="form.tenantName" label="租户名称" required /><Input v-model="form.contactName" label="联系人" /><Input v-model="form.contactPhone" label="联系电话" /><Input v-model="form.contactEmail" label="联系邮箱" type="email" /><Input v-model="form.domain" label="域名" /><Input v-model="form.userLimit" label="用户上限" type="number" /><Input v-model="form.storageLimit" label="存储上限 MB" type="number" /><Input v-model="form.expireTime" label="到期日期" type="date" /><label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="form.status" :options="formStatusOptions" /></label><TextArea v-model="form.remark" class="md:col-span-2" label="备注" :rows="3" />
      </div>
      <template #footer><div class="flex justify-end gap-3"><Button variant="outline" @click="closeDialog">取消</Button><Button :disabled="saving" @click="saveTenant"><Save class="h-4 w-4" />保存</Button></div></template>
    </BaseDialog>
    <ConfirmDialog :show="Boolean(pendingDelete)" title="删除租户" :message="pendingDelete ? `确认删除租户“${pendingDelete.tenantName}”？` : ''" confirm-text="删除" danger @cancel="pendingDelete = null" @confirm="confirmDelete" />
  </div>
</template>
