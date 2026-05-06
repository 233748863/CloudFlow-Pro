<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ChevronRight, Edit3, Folder, LayoutPanelTop, Plus, RefreshCcw, RotateCcw, Save, Search, SquareMousePointer, Trash2 } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, Input, Panel, Select, StatusBadge, type Column, type SelectOption } from '@/components/common'
import { type SysMenu, addMenu, deleteMenu, getMenuList, updateMenu } from '@/services/api/systemManage'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, normalizeRows } from '@/pages/hr/hrUtils'

interface FlatMenu extends SysMenu {
  level: number
  [key: string]: unknown
}

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const menus = ref<SysMenu[]>([])
const expandedIds = reactive(new Set<number>())
const dialogOpen = ref(false)
const editingMenu = ref<SysMenu | null>(null)
const pendingDelete = ref<SysMenu | null>(null)
const filters = ref({ keyword: '', status: '' })
const query = ref({ ...filters.value })
const form = ref<SysMenu>({ menuName: '', parentId: 0, orderNum: 0, path: '', component: '', perms: '', icon: '', menuType: 'M', visible: '0', status: '0', isFrame: '1', isCache: '1' })

const columns: Column<FlatMenu>[] = [
  { key: 'menuName', label: '菜单名称' },
  { key: 'icon', label: '图标' },
  { key: 'orderNum', label: '排序', sortable: true },
  { key: 'perms', label: '权限标识' },
  { key: 'menuType', label: '类型' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '停用' }
]
const formStatusOptions = statusOptions.slice(1)
const menuTypeOptions: SelectOption[] = [
  { value: 'M', label: '目录' },
  { value: 'C', label: '菜单' },
  { value: 'F', label: '按钮' }
]
const visibleOptions: SelectOption[] = [
  { value: '0', label: '显示' },
  { value: '1', label: '隐藏' }
]

const treeMenus = computed(() => buildTree(menus.value))
const flatMenus = computed<FlatMenu[]>(() => flattenTree(filterTree(treeMenus.value), 0))
const parentOptions = computed<SelectOption[]>(() => [
  { value: 0, label: '主目录' },
  ...flattenTree(treeMenus.value, 0)
    .filter((item) => item.menuType !== 'F' && item.menuId !== editingMenu.value?.menuId)
    .map((item) => ({ value: item.menuId || 0, label: `${'　'.repeat(item.level)}${item.menuName}` }))
])
const summary = computed(() => ({
  total: menus.value.length,
  dirs: menus.value.filter((item) => item.menuType === 'M').length,
  pages: menus.value.filter((item) => item.menuType === 'C').length,
  buttons: menus.value.filter((item) => item.menuType === 'F').length
}))
const hasFilters = computed(() => Boolean(query.value.keyword || query.value.status))
const dialogTitle = computed(() => editingMenu.value ? '编辑菜单' : '新增菜单')

function buildTree(items: SysMenu[], parentId = 0): SysMenu[] {
  return items
    .filter((item) => Number(item.parentId || 0) === parentId)
    .map((item) => ({ ...item, children: buildTree(items, Number(item.menuId || 0)) }))
    .sort((a, b) => Number(a.orderNum || 0) - Number(b.orderNum || 0))
}
function filterTree(nodes: SysMenu[]): SysMenu[] {
  const keyword = query.value.keyword.toLowerCase()
  return nodes.flatMap((node) => {
    const children = filterTree(node.children || [])
    const matchKeyword = !keyword || [node.menuName, node.path, node.component, node.perms, node.icon].some((value) => String(value || '').toLowerCase().includes(keyword))
    const matchStatus = !query.value.status || (node.status || '0') === query.value.status
    if ((matchKeyword && matchStatus) || children.length > 0) return [{ ...node, children }]
    return []
  })
}
function flattenTree(nodes: SysMenu[], level: number): FlatMenu[] {
  return nodes.flatMap((node) => {
    const row = { ...node, level }
    const showChildren = hasFilters.value || expandedIds.has(Number(node.menuId || 0))
    return [row, ...(showChildren ? flattenTree(node.children || [], level + 1) : [])]
  })
}
function statusLabel(status?: string) { return status === '1' ? '停用' : '正常' }
function statusTone(status?: string) { return status === '1' ? 'red' : 'green' }
function typeLabel(type?: string) { return type === 'M' ? '目录' : type === 'F' ? '按钮' : '菜单' }
function typeTone(type?: string) { return type === 'M' ? 'cyan' : type === 'F' ? 'yellow' : 'green' }
function hasChildren(row: FlatMenu) { return Boolean(row.children?.length) }
function toggleExpand(id?: number) {
  if (!id) return
  if (expandedIds.has(id)) expandedIds.delete(id)
  else expandedIds.add(id)
}

async function fetchMenus() {
  loading.value = true
  try {
    const data = await getMenuList()
    menus.value = normalizeRows<SysMenu>(data).map((item) => ({ ...item, parentId: Number(item.parentId || 0), orderNum: Number(item.orderNum || 0), status: item.status || '0', menuType: item.menuType || 'M' }))
    expandedIds.clear()
    menus.value.filter((item) => Number(item.parentId || 0) === 0).forEach((item) => item.menuId && expandedIds.add(item.menuId))
  } catch (error) {
    menus.value = []
    toast.error(getErrorMessage(error, '菜单列表加载失败'))
  } finally {
    loading.value = false
  }
}
function searchMenus() { query.value = { keyword: filters.value.keyword.trim(), status: filters.value.status } }
function resetFilters() { filters.value = { keyword: '', status: '' }; query.value = { ...filters.value } }
function openDialog(menu?: SysMenu, parentId?: number) {
  editingMenu.value = menu || null
  form.value = {
    menuId: menu?.menuId,
    menuName: menu?.menuName || '',
    parentId: menu?.parentId ?? parentId ?? 0,
    orderNum: Number(menu?.orderNum || 0),
    path: menu?.path || '',
    component: menu?.component || '',
    perms: menu?.perms || '',
    icon: menu?.icon || '',
    menuType: menu?.menuType || 'M',
    visible: menu?.visible || '0',
    status: menu?.status || '0',
    isFrame: menu?.isFrame || '1',
    isCache: menu?.isCache || '1',
    remark: menu?.remark || ''
  }
  dialogOpen.value = true
}
function closeDialog() { dialogOpen.value = false; editingMenu.value = null }
async function saveMenu() {
  if (!form.value.menuName.trim()) return toast.error('请输入菜单名称')
  saving.value = true
  try {
    const payload = { ...form.value, menuName: form.value.menuName.trim(), orderNum: Number(form.value.orderNum || 0) }
    if (editingMenu.value?.menuId) await updateMenu({ ...payload, menuId: editingMenu.value.menuId })
    else await addMenu(payload)
    closeDialog()
    toast.success('保存成功')
    await fetchMenus()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存菜单失败'))
  } finally {
    saving.value = false
  }
}
async function confirmDelete() {
  if (!pendingDelete.value?.menuId) return
  saving.value = true
  try {
    await deleteMenu(pendingDelete.value.menuId)
    pendingDelete.value = null
    toast.success('删除成功')
    await fetchMenus()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除菜单失败，请确认该菜单下没有子节点'))
  } finally {
    saving.value = false
  }
}

onMounted(() => void fetchMenus())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"><LayoutPanelTop class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />System Menu</div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">菜单管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">维护路由菜单、按钮权限和前端展示状态</p>
      </div>
      <div class="flex flex-wrap gap-2"><Button variant="outline" :disabled="loading" @click="fetchMenus"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button><Button @click="openDialog()"><Plus class="h-4 w-4" />新增菜单</Button></div>
    </div>
    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">菜单总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">目录</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.dirs) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">菜单</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.pages) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">按钮</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.buttons) }}</div></div>
    </div>
    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <Input v-model="filters.keyword" label="关键字" placeholder="名称/路由/组件/权限/图标" @enter="searchMenus" />
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="filters.status" :options="statusOptions" /></label>
        <div class="flex items-end gap-2"><Button @click="searchMenus"><Search class="h-4 w-4" />查询</Button><Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button></div>
      </div>
    </Panel>
    <Panel title="菜单列表">
      <template #icon><LayoutPanelTop class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="flatMenus" :loading="loading" row-key="menuId">
        <template #cell-menuName="{ row }">
          <div class="flex items-center gap-2" :style="{ paddingLeft: `${row.level * 22}px` }">
            <button v-if="hasChildren(row)" class="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800" @click="toggleExpand(row.menuId)"><ChevronRight class="h-4 w-4 transition" :class="expandedIds.has(row.menuId || 0) || hasFilters ? 'rotate-90' : ''" /></button>
            <span v-else class="w-6" />
            <Folder v-if="row.menuType === 'M'" class="h-4 w-4 text-cyan-500" />
            <SquareMousePointer v-else-if="row.menuType === 'F'" class="h-4 w-4 text-amber-500" />
            <LayoutPanelTop v-else class="h-4 w-4 text-emerald-500" />
            <div><div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.menuName }}</div><div class="text-xs text-slate-500">{{ row.path || row.component || '-' }}</div></div>
          </div>
        </template>
        <template #cell-icon="{ row }">{{ row.icon || '-' }}</template>
        <template #cell-perms="{ row }"><code v-if="row.perms" class="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-900">{{ row.perms }}</code><span v-else>-</span></template>
        <template #cell-menuType="{ row }"><StatusBadge :label="typeLabel(row.menuType)" :tone="typeTone(row.menuType)" /></template>
        <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" /></template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button size="icon" variant="ghost" @click="openDialog(row)"><Edit3 class="h-4 w-4" /></Button><Button v-if="row.menuType !== 'F'" size="icon" variant="ghost" @click="openDialog(undefined, row.menuId)"><Plus class="h-4 w-4" /></Button><Button size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button></div></template>
      </DataTable>
    </Panel>
    <BaseDialog :show="dialogOpen" :title="dialogTitle" width="extra-wide" @close="closeDialog">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label class="space-y-2"><span class="text-sm font-medium">上级菜单</span><Select v-model="form.parentId" :options="parentOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">菜单类型</span><Select v-model="form.menuType" :options="menuTypeOptions" /></label>
        <Input v-model="form.menuName" label="菜单名称" required />
        <Input v-model="form.orderNum" label="排序" type="number" />
        <Input v-if="form.menuType !== 'F'" v-model="form.path" label="路由地址" />
        <Input v-if="form.menuType === 'C'" v-model="form.component" label="组件路径" />
        <Input v-model="form.perms" label="权限标识" />
        <Input v-model="form.icon" label="图标标识" />
        <label class="space-y-2"><span class="text-sm font-medium">显示状态</span><Select v-model="form.visible" :options="visibleOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="form.status" :options="formStatusOptions" /></label>
      </div>
      <template #footer><div class="flex justify-end gap-3"><Button variant="outline" @click="closeDialog">取消</Button><Button :disabled="saving" @click="saveMenu"><Save class="h-4 w-4" />保存</Button></div></template>
    </BaseDialog>
    <ConfirmDialog :show="Boolean(pendingDelete)" title="删除菜单" :message="pendingDelete ? `确认删除菜单“${pendingDelete.menuName}”？如果存在子节点会删除失败。` : ''" confirm-text="删除" danger @cancel="pendingDelete = null" @confirm="confirmDelete" />
  </div>
</template>
