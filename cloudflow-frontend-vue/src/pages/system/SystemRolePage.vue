<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Edit3, Plus, RefreshCcw, RotateCcw, Save, Search, Shield, Trash2 } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, Input, Panel, Select, StatusBadge, TextArea, type Column, type SelectOption } from '@/components/common'
import { type SysRole, addRole, deleteRole, getRoleList, updateRole } from '@/services/api/systemManage'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, normalizeRows } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const roles = ref<SysRole[]>([])
const dialogOpen = ref(false)
const editingRole = ref<SysRole | null>(null)
const pendingDelete = ref<SysRole | null>(null)

const filters = ref({ roleName: '', roleKey: '', status: '' })
const query = ref({ ...filters.value })
const form = ref<SysRole>({ roleName: '', roleKey: '', roleSort: 0, status: '0', dsType: 0, remark: '' })

const columns: Column<SysRole>[] = [
  { key: 'roleId', label: 'ID', sortable: true },
  { key: 'roleName', label: '角色名称' },
  { key: 'roleKey', label: '权限字符' },
  { key: 'roleSort', label: '排序', sortable: true },
  { key: 'dsType', label: '数据权限' },
  { key: 'status', label: '状态' },
  { key: 'createTime', label: '创建时间', sortable: true },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '停用' }
]
const formStatusOptions: SelectOption[] = statusOptions.slice(1)
const dsTypeOptions: SelectOption[] = [
  { value: 0, label: '全部数据' },
  { value: 1, label: '自定义' },
  { value: 2, label: '本级及下级' },
  { value: 3, label: '本级' },
  { value: 4, label: '本人' }
]

const filteredRoles = computed(() => roles.value.filter((item) => {
  const matchName = !query.value.roleName || item.roleName.includes(query.value.roleName)
  const matchKey = !query.value.roleKey || item.roleKey.includes(query.value.roleKey)
  const matchStatus = !query.value.status || (item.status || '0') === query.value.status
  return matchName && matchKey && matchStatus
}))
const summary = computed(() => ({
  total: roles.value.length,
  active: roles.value.filter((item) => (item.status || '0') === '0').length,
  disabled: roles.value.filter((item) => item.status === '1').length,
  customScope: roles.value.filter((item) => item.dsType === 1).length
}))
const hasFilters = computed(() => Boolean(query.value.roleName || query.value.roleKey || query.value.status))
const dialogTitle = computed(() => editingRole.value ? '编辑角色' : '新增角色')

function statusLabel(status?: string) { return status === '1' ? '停用' : '正常' }
function statusTone(status?: string) { return status === '1' ? 'red' : 'green' }
function dsTypeLabel(value?: number) { return dsTypeOptions.find((item) => item.value === Number(value ?? 0))?.label || '全部数据' }
function formatDateTime(value?: string | null) { return value ? String(value).replace('T', ' ').slice(0, 16) : '-' }

async function fetchRoles() {
  loading.value = true
  try {
    const data = await getRoleList()
    roles.value = normalizeRows<SysRole>(data)
  } catch (error) {
    roles.value = []
    toast.error(getErrorMessage(error, '角色列表加载失败'))
  } finally {
    loading.value = false
  }
}

function searchRoles() {
  query.value = {
    roleName: filters.value.roleName.trim(),
    roleKey: filters.value.roleKey.trim(),
    status: filters.value.status
  }
}

function resetFilters() {
  filters.value = { roleName: '', roleKey: '', status: '' }
  query.value = { ...filters.value }
}

function openDialog(role?: SysRole) {
  editingRole.value = role || null
  form.value = {
    roleId: role?.roleId,
    roleName: role?.roleName || '',
    roleKey: role?.roleKey || '',
    roleSort: Number(role?.roleSort || 0),
    status: role?.status || '0',
    dsType: Number(role?.dsType || 0),
    dsScope: role?.dsScope || '',
    remark: role?.remark || ''
  }
  dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  editingRole.value = null
}

async function saveRole() {
  if (!form.value.roleName.trim()) return toast.error('请输入角色名称')
  if (!form.value.roleKey.trim()) return toast.error('请输入权限字符')
  saving.value = true
  try {
    const payload = { ...form.value, roleName: form.value.roleName.trim(), roleKey: form.value.roleKey.trim(), roleSort: Number(form.value.roleSort || 0), dsType: Number(form.value.dsType || 0) }
    if (editingRole.value?.roleId) await updateRole({ ...payload, roleId: editingRole.value.roleId })
    else await addRole(payload)
    closeDialog()
    toast.success('保存成功')
    await fetchRoles()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存角色失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value?.roleId) return
  saving.value = true
  try {
    await deleteRole([pendingDelete.value.roleId])
    pendingDelete.value = null
    toast.success('删除成功')
    await fetchRoles()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除角色失败'))
  } finally {
    saving.value = false
  }
}

onMounted(() => void fetchRoles())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"><Shield class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />System Role</div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">角色管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">维护角色权限字符、数据范围和启停状态</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchRoles"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="openDialog()"><Plus class="h-4 w-4" />新增角色</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">角色总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">正常角色</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.active) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">停用角色</div><div class="mt-2 text-2xl font-semibold text-red-600 dark:text-red-300">{{ formatNumber(summary.disabled) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">自定义权限</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.customScope) }}</div></div>
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_auto]">
        <Input v-model="filters.roleName" label="角色名称" placeholder="按名称查询" @enter="searchRoles" />
        <Input v-model="filters.roleKey" label="权限字符" placeholder="按权限字符查询" @enter="searchRoles" />
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="filters.status" :options="statusOptions" /></label>
        <div class="flex items-end gap-2">
          <Button @click="searchRoles"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel title="角色列表">
      <template #icon><Shield class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="filteredRoles" :loading="loading" row-key="roleId">
        <template #cell-roleId="{ row }"><span class="font-mono text-xs text-slate-500">#{{ row.roleId }}</span></template>
        <template #cell-roleName="{ row }"><div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.roleName }}</div></template>
        <template #cell-roleKey="{ row }"><code class="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-900">{{ row.roleKey }}</code></template>
        <template #cell-dsType="{ row }">{{ dsTypeLabel(row.dsType) }}</template>
        <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" /></template>
        <template #cell-createTime="{ row }">{{ formatDateTime(row.createTime) }}</template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button size="icon" variant="ghost" @click="openDialog(row)"><Edit3 class="h-4 w-4" /></Button><Button size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button></div></template>
      </DataTable>
    </Panel>

    <BaseDialog :show="dialogOpen" :title="dialogTitle" width="wide" @close="closeDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <Input v-model="form.roleName" label="角色名称" required />
        <Input v-model="form.roleKey" label="权限字符" required />
        <Input v-model="form.roleSort" label="显示排序" type="number" />
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="form.status" :options="formStatusOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">数据权限</span><Select v-model="form.dsType" :options="dsTypeOptions" /></label>
        <Input v-model="form.dsScope" label="自定义部门范围" placeholder="部门 ID，逗号分隔" />
        <TextArea v-model="form.remark" class="md:col-span-2" label="备注" :rows="4" />
      </div>
      <template #footer><div class="flex justify-end gap-3"><Button variant="outline" @click="closeDialog">取消</Button><Button :disabled="saving" @click="saveRole"><Save class="h-4 w-4" />保存</Button></div></template>
    </BaseDialog>

    <ConfirmDialog :show="Boolean(pendingDelete)" title="删除角色" :message="pendingDelete ? `确认删除角色“${pendingDelete.roleName}”？` : ''" confirm-text="删除" danger @cancel="pendingDelete = null" @confirm="confirmDelete" />
  </div>
</template>
