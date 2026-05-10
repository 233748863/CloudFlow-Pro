<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ChevronDown, ChevronRight, Edit3, Plus, RefreshCcw, RotateCcw, Save, Search, Shield, Trash2 } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, Input, Panel, Select, StatusBadge, TextArea, type Column, type SelectOption } from '@/components/common'
import { type SysMenu, type SysRole, addRole, deleteRole, getMenuTreeSelect, getRole, getRoleList, updateRole } from '@/services/api/systemManage'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, normalizeRows } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const roleDetailLoading = ref(false)
const roles = ref<SysRole[]>([])
const menus = ref<MenuTreeNode[]>([])
const flatMenus = ref<MenuTreeNode[]>([])
const expandedMenuIds = ref<number[]>([])
const dialogOpen = ref(false)
const editingRole = ref<SysRole | null>(null)
const pendingDelete = ref<SysRole | null>(null)
let roleDetailRequestId = 0

interface MenuTreeNode {
  menuId: number
  parentId: number
  menuName: string
  orderNum: number
  children?: MenuTreeNode[]
}

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
function normalizeNumberList(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((item) => !Number.isNaN(item))
  if (typeof value === 'string') {
    return value.split(',').map((item) => Number.parseInt(item.trim(), 10)).filter((item) => !Number.isNaN(item))
  }
  return []
}
function buildMenuTree(items: MenuTreeNode[], parentId = 0): MenuTreeNode[] {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({ ...item, children: buildMenuTree(items, item.menuId) }))
    .sort((left, right) => left.orderNum - right.orderNum)
}
function normalizeMenu(item: SysMenu): MenuTreeNode {
  return {
    menuId: Number(item.menuId),
    parentId: Number(item.parentId || 0),
    menuName: item.menuName || '',
    orderNum: Number(item.orderNum || 0)
  }
}
function flattenMenuTree(items: SysMenu[]): MenuTreeNode[] {
  const result: MenuTreeNode[] = []
  const walk = (nodes: SysMenu[]) => {
    nodes.forEach((node) => {
      result.push(normalizeMenu(node))
      if (Array.isArray(node.children) && node.children.length > 0) walk(node.children)
    })
  }
  walk(items)
  return result
}
function roleToForm(role?: SysRole | null): SysRole {
  return {
    roleId: role?.roleId,
    tenantId: role?.tenantId,
    roleName: role?.roleName || '',
    roleKey: role?.roleKey || '',
    roleSort: Number(role?.roleSort || 0),
    status: role?.status || '0',
    dsType: Number(role?.dsType ?? 0),
    dsScope: role?.dsScope || '',
    menuIds: normalizeNumberList(role?.menuIds),
    remark: role?.remark || ''
  }
}

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

async function fetchMenus() {
  try {
    const data = await getMenuTreeSelect()
    const rows = normalizeRows<SysMenu>(data)
    const normalized = rows.some((item) => Array.isArray(item.children) && item.children.length > 0)
      ? flattenMenuTree(rows)
      : rows.map(normalizeMenu)
    flatMenus.value = normalized.filter((item) => item.menuId > 0)
    menus.value = buildMenuTree(flatMenus.value)
    expandedMenuIds.value = flatMenus.value.filter((item) => item.parentId === 0).map((item) => item.menuId)
  } catch (error) {
    flatMenus.value = []
    menus.value = []
    toast.error(getErrorMessage(error, '菜单列表加载失败'))
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

async function openDialog(role?: SysRole) {
  editingRole.value = role || null
  form.value = roleToForm(role)
  dialogOpen.value = true

  if (!role?.roleId) return

  const requestId = ++roleDetailRequestId
  roleDetailLoading.value = true
  try {
    const detail = await getRole(role.roleId)
    if (roleDetailRequestId !== requestId) return
    editingRole.value = { ...role, ...detail }
    form.value = roleToForm({ ...role, ...detail })
  } catch (error) {
    if (roleDetailRequestId === requestId) toast.error(getErrorMessage(error, '加载角色权限失败'))
  } finally {
    if (roleDetailRequestId === requestId) roleDetailLoading.value = false
  }
}

function closeDialog() {
  roleDetailRequestId++
  roleDetailLoading.value = false
  dialogOpen.value = false
  editingRole.value = null
}

function collectChildIds(menuId: number): number[] {
  const children = flatMenus.value.filter((item) => item.parentId === menuId)
  return children.flatMap((child) => [child.menuId, ...collectChildIds(child.menuId)])
}

function toggleMenu(menuId: number) {
  if (roleDetailLoading.value) return
  const currentIds = normalizeNumberList(form.value.menuIds)
  const relatedIds = [menuId, ...collectChildIds(menuId)]
  const checked = currentIds.includes(menuId)
  form.value.menuIds = checked
    ? currentIds.filter((id) => !relatedIds.includes(id))
    : Array.from(new Set([...currentIds, ...relatedIds]))
}

function toggleExpand(menuId: number) {
  expandedMenuIds.value = expandedMenuIds.value.includes(menuId)
    ? expandedMenuIds.value.filter((id) => id !== menuId)
    : [...expandedMenuIds.value, menuId]
}

async function saveRole() {
  if (!form.value.roleName.trim()) return toast.error('请输入角色名称')
  if (!form.value.roleKey.trim()) return toast.error('请输入权限字符')
  saving.value = true
  try {
    const payload = {
      ...form.value,
      roleName: form.value.roleName.trim(),
      roleKey: form.value.roleKey.trim(),
      roleSort: Number(form.value.roleSort || 0),
      dsType: Number(form.value.dsType || 0),
      menuIds: normalizeNumberList(form.value.menuIds)
    }
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

onMounted(() => {
  void fetchRoles()
  void fetchMenus()
})
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
      <div class="space-y-4">
        <div v-if="roleDetailLoading" class="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">正在加载角色授权...</div>
        <div class="grid gap-4 md:grid-cols-2">
          <Input v-model="form.roleName" label="角色名称" required />
          <Input v-model="form.roleKey" label="权限字符" required />
          <Input v-model="form.roleSort" label="显示排序" type="number" />
          <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="form.status" :options="formStatusOptions" /></label>
          <label class="space-y-2"><span class="text-sm font-medium">数据权限</span><Select v-model="form.dsType" :options="dsTypeOptions" /></label>
          <Input v-model="form.dsScope" label="自定义部门范围" placeholder="部门 ID，逗号分隔" />
          <TextArea v-model="form.remark" class="md:col-span-2" label="备注" :rows="4" />
        </div>
        <div>
          <div class="mb-2 text-sm font-medium">菜单权限</div>
          <div class="max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
            <template v-if="menus.length > 0">
              <template v-for="node in menus" :key="node.menuId">
                <div class="ml-1">
                  <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition hover:bg-white dark:text-slate-200 dark:hover:bg-slate-950/80">
                    <button v-if="node.children?.length" type="button" class="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200" @click.prevent.stop="toggleExpand(node.menuId)">
                      <ChevronDown v-if="expandedMenuIds.includes(node.menuId)" class="h-3.5 w-3.5" />
                      <ChevronRight v-else class="h-3.5 w-3.5" />
                    </button>
                    <span v-else class="w-5" />
                    <input type="checkbox" class="h-4 w-4 rounded border-slate-300 accent-cyan-600" :checked="normalizeNumberList(form.menuIds).includes(node.menuId)" :disabled="roleDetailLoading" @change="toggleMenu(node.menuId)" />
                    <span class="font-medium">{{ node.menuName }}</span>
                  </label>
                  <template v-if="expandedMenuIds.includes(node.menuId)">
                    <template v-for="child in node.children || []" :key="child.menuId">
                      <div class="ml-6">
                        <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition hover:bg-white dark:text-slate-200 dark:hover:bg-slate-950/80">
                          <button v-if="child.children?.length" type="button" class="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200" @click.prevent.stop="toggleExpand(child.menuId)">
                            <ChevronDown v-if="expandedMenuIds.includes(child.menuId)" class="h-3.5 w-3.5" />
                            <ChevronRight v-else class="h-3.5 w-3.5" />
                          </button>
                          <span v-else class="w-5" />
                          <input type="checkbox" class="h-4 w-4 rounded border-slate-300 accent-cyan-600" :checked="normalizeNumberList(form.menuIds).includes(child.menuId)" :disabled="roleDetailLoading" @change="toggleMenu(child.menuId)" />
                          <span class="font-medium">{{ child.menuName }}</span>
                        </label>
                        <div v-if="expandedMenuIds.includes(child.menuId)" class="ml-6">
                          <label v-for="leaf in child.children || []" :key="leaf.menuId" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition hover:bg-white dark:text-slate-200 dark:hover:bg-slate-950/80">
                            <span class="w-5" />
                            <input type="checkbox" class="h-4 w-4 rounded border-slate-300 accent-cyan-600" :checked="normalizeNumberList(form.menuIds).includes(leaf.menuId)" :disabled="roleDetailLoading" @change="toggleMenu(leaf.menuId)" />
                            <span class="font-medium">{{ leaf.menuName }}</span>
                          </label>
                        </div>
                      </div>
                    </template>
                  </template>
                </div>
              </template>
            </template>
            <div v-else class="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">暂无菜单数据</div>
          </div>
        </div>
      </div>
      <template #footer><div class="flex justify-end gap-3"><Button variant="outline" @click="closeDialog">取消</Button><Button :disabled="saving || roleDetailLoading" @click="saveRole"><Save class="h-4 w-4" />保存</Button></div></template>
    </BaseDialog>

    <ConfirmDialog :show="Boolean(pendingDelete)" title="删除角色" :message="pendingDelete ? `确认删除角色“${pendingDelete.roleName}”？` : ''" confirm-text="删除" danger @cancel="pendingDelete = null" @confirm="confirmDelete" />
  </div>
</template>
