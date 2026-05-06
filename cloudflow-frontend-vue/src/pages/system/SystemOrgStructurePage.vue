<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowRightLeft, Building2, ChevronRight, Edit3, Eye, Plus, RefreshCcw, RotateCcw, Save, Search, Trash2, UsersRound } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, Input, Panel, Select, StatusBadge, type Column, type SelectOption } from '@/components/common'
import { type SysDept, type SysUser, addDept, deleteDept, deleteUser, getDeptTree, getUserList, updateDept, updateUser } from '@/services/api/systemManage'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, normalizeRows } from '@/pages/hr/hrUtils'

interface FlatDept extends SysDept {
  level: number
  children?: FlatDept[]
  [key: string]: unknown
}

const toast = useToastStore()
const deptLoading = ref(false)
const userLoading = ref(false)
const saving = ref(false)
const departments = ref<SysDept[]>([])
const users = ref<SysUser[]>([])
const selectedDeptId = ref<number | null>(null)
const expandedIds = reactive(new Set<number>())
const deptSearch = ref('')
const userSearch = ref('')
const dialogOpen = ref(false)
const moveDialogOpen = ref(false)
const detailUser = ref<SysUser | null>(null)
const editingDept = ref<SysDept | null>(null)
const pendingDeleteDept = ref<SysDept | null>(null)
const pendingDeleteUser = ref<SysUser | null>(null)
const movingUser = ref<SysUser | null>(null)
const targetDeptId = ref<number | null>(null)
const form = ref<SysDept>({ parentId: 0, deptName: '', orderNum: 0, leader: '', phone: '', email: '', status: '0' })

const columns: Column<SysUser>[] = [
  { key: 'nickName', label: '成员' },
  { key: 'userName', label: '账号' },
  { key: 'deptName', label: '部门' },
  { key: 'phonenumber', label: '手机' },
  { key: 'email', label: '邮箱' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]
const statusOptions: SelectOption[] = [
  { value: '0', label: '正常' },
  { value: '1', label: '停用' }
]

const treeDepartments = computed(() => normalizeDeptTree(departments.value))
const selectedDept = computed(() => findDept(treeDepartments.value, selectedDeptId.value))
const flatDepartments = computed(() => flattenDepts(treeDepartments.value))
const filteredTree = computed(() => filterDeptTree(treeDepartments.value, deptSearch.value))
const visibleDepartments = computed(() => flattenVisibleDepts(filteredTree.value))
const deptOptions = computed<SelectOption[]>(() => [
  { value: 0, label: '顶级部门' },
  ...flatDepartments.value
    .filter((item) => item.deptId !== editingDept.value?.deptId)
    .map((item) => ({ value: item.deptId || 0, label: `${'　'.repeat(item.level)}${item.deptName}` }))
])
const filteredUsers = computed(() => {
  const keyword = userSearch.value.trim()
  return users.value.filter((user) => {
    if (!keyword) return true
    return [user.nickName, user.userName, user.email, user.phonenumber, user.deptName]
      .some((value) => String(value || '').includes(keyword))
  })
})
const summary = computed(() => ({
  departments: flatDepartments.value.length,
  activeDepartments: flatDepartments.value.filter((item) => (item.status || '0') === '0').length,
  users: users.value.length,
  activeUsers: users.value.filter((item) => (item.status || '0') === '0').length
}))
const dialogTitle = computed(() => editingDept.value ? '编辑部门' : '新增部门')

function normalizeDeptTree(nodes: SysDept[] = []): FlatDept[] {
  return nodes
    .map((node) => ({
      ...node,
      level: 0,
      parentId: Number(node.parentId || 0),
      orderNum: Number(node.orderNum || 0),
      status: node.status || '0',
      children: normalizeDeptTree(node.children || [])
    }))
    .sort((a, b) => Number(a.orderNum || 0) - Number(b.orderNum || 0))
}
function flattenDepts(nodes: FlatDept[], level = 0): FlatDept[] {
  return nodes.flatMap((node) => [{ ...node, level }, ...flattenDepts(node.children || [], level + 1)])
}
function flattenVisibleDepts(nodes: FlatDept[], level = 0): FlatDept[] {
  return nodes.flatMap((node) => {
    const row = { ...node, level }
    const showChildren = Boolean(deptSearch.value.trim()) || expandedIds.has(Number(node.deptId || 0))
    return [row, ...(showChildren ? flattenVisibleDepts(node.children || [], level + 1) : [])]
  })
}
function filterDeptTree(nodes: FlatDept[], keyword: string): FlatDept[] {
  const value = keyword.trim().toLowerCase()
  if (!value) return nodes
  return nodes.flatMap((node) => {
    const children = filterDeptTree(node.children || [], keyword)
    const matched = [node.deptName, node.leader, node.phone, node.email, node.deptId]
      .some((item) => String(item || '').toLowerCase().includes(value))
    return matched || children.length > 0 ? [{ ...node, children }] : []
  })
}
function findDept(nodes: FlatDept[], deptId: number | null): FlatDept | null {
  if (!deptId) return null
  for (const node of nodes) {
    if (node.deptId === deptId) return node
    const matched = findDept(node.children || [], deptId)
    if (matched) return matched
  }
  return null
}
function hasChildren(dept: FlatDept) { return Boolean(dept.children?.length) }
function statusLabel(status?: string) { return status === '1' ? '停用' : '正常' }
function statusTone(status?: string) { return status === '1' ? 'red' : 'green' }
function formatDateTime(value?: string | null) { return value ? String(value).replace('T', ' ').slice(0, 16) : '-' }
function toggleExpand(id?: number) {
  if (!id) return
  if (expandedIds.has(id)) expandedIds.delete(id)
  else expandedIds.add(id)
}

async function fetchDepartments() {
  deptLoading.value = true
  try {
    departments.value = await getDeptTree()
    expandedIds.clear()
    normalizeDeptTree(departments.value).forEach((item) => item.deptId && expandedIds.add(item.deptId))
  } catch (error) {
    departments.value = []
    toast.error(getErrorMessage(error, '部门树加载失败'))
  } finally {
    deptLoading.value = false
  }
}
async function fetchUsers() {
  userLoading.value = true
  try {
    users.value = normalizeRows<SysUser>(await getUserList(selectedDeptId.value ? { deptId: selectedDeptId.value } : undefined))
  } catch (error) {
    users.value = []
    toast.error(getErrorMessage(error, '成员列表加载失败'))
  } finally {
    userLoading.value = false
  }
}
async function refreshAll() {
  await Promise.all([fetchDepartments(), fetchUsers()])
}
function selectDept(dept?: SysDept | null) {
  selectedDeptId.value = dept?.deptId || null
  void fetchUsers()
}
function openDeptDialog(dept?: SysDept, parentId?: number) {
  editingDept.value = dept || null
  form.value = {
    deptId: dept?.deptId,
    parentId: dept?.parentId ?? parentId ?? 0,
    deptName: dept?.deptName || '',
    orderNum: Number(dept?.orderNum || 0),
    leader: dept?.leader || '',
    phone: dept?.phone || '',
    email: dept?.email || '',
    status: dept?.status || '0'
  }
  dialogOpen.value = true
}
function closeDeptDialog() {
  dialogOpen.value = false
  editingDept.value = null
}
async function saveDept() {
  if (!form.value.deptName.trim()) return toast.error('请输入部门名称')
  saving.value = true
  try {
    const payload = {
      ...form.value,
      deptName: form.value.deptName.trim(),
      leader: form.value.leader?.trim() || '',
      phone: form.value.phone?.trim() || '',
      email: form.value.email?.trim() || '',
      parentId: Number(form.value.parentId || 0),
      orderNum: Number(form.value.orderNum || 0)
    }
    if (editingDept.value?.deptId) await updateDept({ ...payload, deptId: editingDept.value.deptId })
    else await addDept(payload)
    closeDeptDialog()
    toast.success('保存成功')
    await fetchDepartments()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存部门失败'))
  } finally {
    saving.value = false
  }
}
async function confirmDeleteDept() {
  if (!pendingDeleteDept.value?.deptId) return
  saving.value = true
  try {
    await deleteDept(pendingDeleteDept.value.deptId)
    if (selectedDeptId.value === pendingDeleteDept.value.deptId) selectedDeptId.value = null
    pendingDeleteDept.value = null
    toast.success('删除成功')
    await refreshAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除部门失败，请确认没有子部门'))
  } finally {
    saving.value = false
  }
}
function openMoveDialog(user: SysUser) {
  movingUser.value = user
  targetDeptId.value = user.deptId || null
  moveDialogOpen.value = true
}
async function saveMoveUser() {
  if (!movingUser.value?.userId || !targetDeptId.value) return toast.error('请选择目标部门')
  saving.value = true
  try {
    await updateUser({ ...movingUser.value, deptId: targetDeptId.value })
    moveDialogOpen.value = false
    movingUser.value = null
    toast.success('部门已调整')
    await fetchUsers()
  } catch (error) {
    toast.error(getErrorMessage(error, '调整部门失败'))
  } finally {
    saving.value = false
  }
}
async function confirmDeleteUser() {
  if (!pendingDeleteUser.value?.userId) return
  saving.value = true
  try {
    await deleteUser([pendingDeleteUser.value.userId])
    pendingDeleteUser.value = null
    toast.success('删除成功')
    await fetchUsers()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除成员失败'))
  } finally {
    saving.value = false
  }
}

onMounted(() => void refreshAll())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"><Building2 class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />System Org</div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">组织架构</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">维护部门树、部门负责人和成员归属</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="deptLoading || userLoading" @click="refreshAll"><RefreshCcw class="h-4 w-4" :class="deptLoading || userLoading ? 'animate-spin' : ''" />刷新组织</Button>
        <Button @click="openDeptDialog()"><Plus class="h-4 w-4" />新增部门</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">部门总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.departments) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">正常部门</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.activeDepartments) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">当前成员</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.users) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">正常成员</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.activeUsers) }}</div></div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="部门树">
        <template #icon><Building2 class="h-4 w-4 text-slate-500" /></template>
        <template #actions><Button size="sm" variant="outline" @click="selectDept(null)">全部成员</Button></template>
        <div class="space-y-3">
          <Input v-model="deptSearch" placeholder="搜索部门/负责人/电话" @enter="() => undefined">
            <template #prefix><Search class="h-4 w-4" /></template>
          </Input>
          <div class="max-h-[68vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-900/30">
            <div v-if="deptLoading" class="px-4 py-12 text-center text-sm text-slate-500">正在加载部门树</div>
            <div v-else-if="visibleDepartments.length === 0" class="px-4 py-12 text-center text-sm text-slate-500">暂无部门数据</div>
            <div v-else class="space-y-1">
              <div
                v-for="dept in visibleDepartments"
                :key="dept.deptId"
                class="flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-white dark:hover:bg-slate-950"
                :class="selectedDeptId === dept.deptId ? 'bg-white shadow-sm ring-1 ring-cyan-200 dark:bg-slate-950 dark:ring-cyan-900/70' : ''"
                :style="{ paddingLeft: `${dept.level * 18 + 8}px` }"
              >
                <button class="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800" @click="toggleExpand(dept.deptId)">
                  <ChevronRight class="h-4 w-4 transition" :class="hasChildren(dept) && (expandedIds.has(dept.deptId || 0) || deptSearch) ? 'rotate-90' : hasChildren(dept) ? '' : 'opacity-0'" />
                </button>
                <button class="min-w-0 flex-1 text-left" @click="selectDept(dept)">
                  <div class="truncate font-medium text-slate-900 dark:text-slate-100">{{ dept.deptName }}</div>
                  <div class="truncate text-xs text-slate-500">{{ dept.leader || '未设置负责人' }}</div>
                </button>
                <StatusBadge :label="statusLabel(dept.status)" :tone="statusTone(dept.status)" />
              </div>
            </div>
          </div>
          <div v-if="selectedDept" class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/90">
            <div class="font-semibold text-slate-900 dark:text-slate-100">{{ selectedDept.deptName }}</div>
            <div class="mt-1 text-xs text-slate-500">负责人 {{ selectedDept.leader || '-' }} · 排序 {{ selectedDept.orderNum || 0 }}</div>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" @click="openDeptDialog(undefined, selectedDept.deptId)"><Plus class="h-3.5 w-3.5" />子部门</Button>
              <Button size="sm" variant="outline" @click="openDeptDialog(selectedDept)"><Edit3 class="h-3.5 w-3.5" />编辑</Button>
              <Button size="sm" variant="outline" @click="pendingDeleteDept = selectedDept"><Trash2 class="h-3.5 w-3.5 text-red-500" />删除</Button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel :title="selectedDept ? `${selectedDept.deptName}成员` : '全部成员'">
        <template #icon><UsersRound class="h-4 w-4 text-slate-500" /></template>
        <div class="space-y-4">
          <div class="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input v-model="userSearch" placeholder="搜索姓名/账号/邮箱/手机/部门" @enter="() => undefined">
              <template #prefix><Search class="h-4 w-4" /></template>
            </Input>
            <Button variant="outline" :disabled="!userSearch" @click="userSearch = ''"><RotateCcw class="h-4 w-4" />清空</Button>
          </div>
          <DataTable :columns="columns" :data="filteredUsers" :loading="userLoading" row-key="userId">
            <template #cell-nickName="{ row }"><div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.nickName || row.userName }}</div><div class="text-xs text-slate-500">ID {{ row.userId }}</div></template>
            <template #cell-email="{ row }"><span class="block max-w-[220px] truncate" :title="row.email">{{ row.email || '-' }}</span></template>
            <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" /></template>
            <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button size="icon" variant="ghost" @click="detailUser = row"><Eye class="h-4 w-4" /></Button><Button size="icon" variant="ghost" @click="openMoveDialog(row)"><ArrowRightLeft class="h-4 w-4" /></Button><Button size="icon" variant="ghost" @click="pendingDeleteUser = row"><Trash2 class="h-4 w-4 text-red-500" /></Button></div></template>
          </DataTable>
        </div>
      </Panel>
    </div>

    <BaseDialog :show="dialogOpen" :title="dialogTitle" width="wide" @close="closeDeptDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">上级部门</span><Select v-model="form.parentId" :options="deptOptions" searchable /></label>
        <Input v-model="form.deptName" label="部门名称" required />
        <Input v-model="form.orderNum" label="排序" type="number" />
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="form.status" :options="statusOptions" /></label>
        <Input v-model="form.leader" label="负责人" />
        <Input v-model="form.phone" label="联系电话" />
        <Input v-model="form.email" class="md:col-span-2" label="邮箱" type="email" />
      </div>
      <template #footer><div class="flex justify-end gap-3"><Button variant="outline" @click="closeDeptDialog">取消</Button><Button :disabled="saving" @click="saveDept"><Save class="h-4 w-4" />保存</Button></div></template>
    </BaseDialog>

    <BaseDialog :show="Boolean(detailUser)" title="成员详情" width="wide" @close="detailUser = null">
      <div v-if="detailUser" class="grid gap-3 md:grid-cols-2">
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="text-xs text-slate-500">姓名</div><div class="mt-1 font-semibold">{{ detailUser.nickName || '-' }}</div></div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="text-xs text-slate-500">账号</div><div class="mt-1 font-semibold">{{ detailUser.userName }}</div></div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="text-xs text-slate-500">部门</div><div class="mt-1 font-semibold">{{ detailUser.deptName || '-' }}</div></div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="text-xs text-slate-500">状态</div><div class="mt-1"><StatusBadge :label="statusLabel(detailUser.status)" :tone="statusTone(detailUser.status)" /></div></div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="text-xs text-slate-500">手机</div><div class="mt-1 font-semibold">{{ detailUser.phonenumber || '-' }}</div></div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="text-xs text-slate-500">邮箱</div><div class="mt-1 font-semibold">{{ detailUser.email || '-' }}</div></div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800 md:col-span-2"><div class="text-xs text-slate-500">创建时间</div><div class="mt-1 font-semibold">{{ formatDateTime(detailUser.createTime) }}</div></div>
      </div>
      <template #footer><div class="flex justify-end"><Button variant="outline" @click="detailUser = null">关闭</Button></div></template>
    </BaseDialog>

    <BaseDialog :show="moveDialogOpen" title="调整部门" width="normal" @close="moveDialogOpen = false">
      <label class="space-y-2"><span class="text-sm font-medium">目标部门</span><Select v-model="targetDeptId" :options="deptOptions.filter((item) => item.value !== 0)" searchable /></label>
      <template #footer><div class="flex justify-end gap-3"><Button variant="outline" @click="moveDialogOpen = false">取消</Button><Button :disabled="saving" @click="saveMoveUser"><Save class="h-4 w-4" />保存</Button></div></template>
    </BaseDialog>

    <ConfirmDialog :show="Boolean(pendingDeleteDept)" title="删除部门" :message="pendingDeleteDept ? `确认删除部门“${pendingDeleteDept.deptName}”？` : ''" confirm-text="删除" danger @cancel="pendingDeleteDept = null" @confirm="confirmDeleteDept" />
    <ConfirmDialog :show="Boolean(pendingDeleteUser)" title="删除成员" :message="pendingDeleteUser ? `确认删除成员“${pendingDeleteUser.nickName || pendingDeleteUser.userName}”？` : ''" confirm-text="删除" danger @cancel="pendingDeleteUser = null" @confirm="confirmDeleteUser" />
  </div>
</template>
