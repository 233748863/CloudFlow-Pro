<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Edit3, KeyRound, Plus, RefreshCcw, RotateCcw, Save, Search, Trash2, UsersRound } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, Input, Panel, Select, StatusBadge, TextArea, type Column, type SelectOption } from '@/components/common'
import { type RoleOption, type SysUser, addUser, deleteUser, getRoleOptions, getUserList, resetUserPassword, updateUser } from '@/services/api/systemManage'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, normalizeRows } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const users = ref<SysUser[]>([])
const roles = ref<RoleOption[]>([])
const dialogOpen = ref(false)
const passwordDialogOpen = ref(false)
const editingUser = ref<SysUser | null>(null)
const passwordUser = ref<SysUser | null>(null)
const pendingDelete = ref<SysUser | null>(null)
const newPassword = ref('')

const filters = ref({ keyword: '', status: '', roleId: '' })
const query = ref({ ...filters.value })
const form = ref<SysUser>({ userName: '', nickName: '', email: '', phonenumber: '', sex: '0', status: '0', roleIds: [], remark: '' })

const columns: Column<SysUser>[] = [
  { key: 'userId', label: 'ID', sortable: true },
  { key: 'userName', label: '用户' },
  { key: 'deptName', label: '部门' },
  { key: 'roles', label: '角色' },
  { key: 'phonenumber', label: '手机号' },
  { key: 'status', label: '状态' },
  { key: 'createTime', label: '创建时间', sortable: true },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '停用' }
]
const formStatusOptions = statusOptions.slice(1)
const sexOptions: SelectOption[] = [
  { value: '0', label: '男' },
  { value: '1', label: '女' },
  { value: '2', label: '未知' }
]
const roleFilterOptions = computed<SelectOption[]>(() => [{ value: '', label: '全部角色' }, ...roles.value.map((item) => ({ value: item.roleId, label: item.roleName }))])

const filteredUsers = computed(() => users.value.filter((item) => {
  const keyword = query.value.keyword
  const roleIds = Array.isArray(item.roleIds) ? item.roleIds.map(Number) : []
  const matchKeyword = !keyword || [item.userName, item.nickName, item.email, item.phonenumber, item.deptName].some((value) => String(value || '').includes(keyword))
  const matchStatus = !query.value.status || (item.status || '0') === query.value.status
  const matchRole = !query.value.roleId || roleIds.includes(Number(query.value.roleId))
  return matchKeyword && matchStatus && matchRole
}))
const summary = computed(() => ({
  total: users.value.length,
  active: users.value.filter((item) => (item.status || '0') === '0').length,
  disabled: users.value.filter((item) => item.status === '1').length,
  roles: roles.value.length
}))
const hasFilters = computed(() => Boolean(query.value.keyword || query.value.status || query.value.roleId))
const dialogTitle = computed(() => editingUser.value ? '编辑用户' : '新增用户')

function statusLabel(status?: string) { return status === '1' ? '停用' : '正常' }
function statusTone(status?: string) { return status === '1' ? 'red' : 'green' }
function formatDateTime(value?: string | null) { return value ? String(value).replace('T', ' ').slice(0, 16) : '-' }
function roleNames(user: SysUser) {
  const ids = Array.isArray(user.roleIds) ? user.roleIds.map(Number) : []
  return roles.value.filter((role) => ids.includes(role.roleId)).map((role) => role.roleName).join('、') || user.role || '-'
}

async function fetchUsers() {
  loading.value = true
  try {
    const [userData, roleData] = await Promise.all([getUserList(), getRoleOptions().catch(() => [] as RoleOption[])])
    users.value = normalizeRows<SysUser>(userData)
    roles.value = Array.isArray(roleData) ? roleData : []
  } catch (error) {
    users.value = []
    toast.error(getErrorMessage(error, '用户列表加载失败'))
  } finally {
    loading.value = false
  }
}

function searchUsers() {
  query.value = { keyword: filters.value.keyword.trim(), status: filters.value.status, roleId: filters.value.roleId }
}
function resetFilters() {
  filters.value = { keyword: '', status: '', roleId: '' }
  query.value = { ...filters.value }
}
function openDialog(user?: SysUser) {
  editingUser.value = user || null
  form.value = {
    userId: user?.userId,
    userName: user?.userName || '',
    nickName: user?.nickName || '',
    email: user?.email || '',
    phonenumber: user?.phonenumber || user?.phone || '',
    sex: user?.sex || '0',
    status: user?.status || '0',
    roleIds: Array.isArray(user?.roleIds) ? user?.roleIds.map(Number) : [],
    remark: user?.remark || ''
  }
  dialogOpen.value = true
}
function closeDialog() {
  dialogOpen.value = false
  editingUser.value = null
}
function toggleRole(roleId: number) {
  const current = Array.isArray(form.value.roleIds) ? form.value.roleIds.map(Number) : []
  form.value.roleIds = current.includes(roleId) ? current.filter((item) => item !== roleId) : [...current, roleId]
}
async function saveUser() {
  if (!form.value.userName.trim()) return toast.error('请输入账号')
  if (!form.value.nickName.trim()) return toast.error('请输入昵称')
  saving.value = true
  try {
    const payload = { ...form.value, userName: form.value.userName.trim(), nickName: form.value.nickName.trim(), phonenumber: form.value.phonenumber?.trim() || '', email: form.value.email?.trim() || '' }
    if (editingUser.value?.userId) await updateUser({ ...payload, userId: editingUser.value.userId })
    else await addUser(payload)
    closeDialog()
    toast.success('保存成功')
    await fetchUsers()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存用户失败'))
  } finally {
    saving.value = false
  }
}
function openPasswordDialog(user: SysUser) {
  passwordUser.value = user
  newPassword.value = ''
  passwordDialogOpen.value = true
}
async function savePassword() {
  if (!passwordUser.value?.userId) return
  if (!newPassword.value.trim()) return toast.error('请输入新密码')
  saving.value = true
  try {
    await resetUserPassword(passwordUser.value.userId, newPassword.value.trim())
    passwordDialogOpen.value = false
    passwordUser.value = null
    toast.success('密码已重置')
  } catch (error) {
    toast.error(getErrorMessage(error, '重置密码失败'))
  } finally {
    saving.value = false
  }
}
async function confirmDelete() {
  if (!pendingDelete.value?.userId) return
  saving.value = true
  try {
    await deleteUser([pendingDelete.value.userId])
    pendingDelete.value = null
    toast.success('删除成功')
    await fetchUsers()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除用户失败'))
  } finally {
    saving.value = false
  }
}

onMounted(() => void fetchUsers())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"><UsersRound class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />System User</div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">用户管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">维护账号、联系方式、角色分配和状态</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchUsers"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="openDialog()"><Plus class="h-4 w-4" />新增用户</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">用户总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">正常用户</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.active) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">停用用户</div><div class="mt-2 text-2xl font-semibold text-red-600 dark:text-red-300">{{ formatNumber(summary.disabled) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">可分配角色</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.roles) }}</div></div>
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_220px_220px_auto]">
        <Input v-model="filters.keyword" label="关键字" placeholder="账号/昵称/邮箱/手机/部门" @enter="searchUsers" />
        <label class="space-y-2"><span class="text-sm font-medium">角色</span><Select v-model="filters.roleId" :options="roleFilterOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="filters.status" :options="statusOptions" /></label>
        <div class="flex items-end gap-2"><Button @click="searchUsers"><Search class="h-4 w-4" />查询</Button><Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button></div>
      </div>
    </Panel>

    <Panel title="用户列表">
      <template #icon><UsersRound class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="filteredUsers" :loading="loading" row-key="userId">
        <template #cell-userId="{ row }"><span class="font-mono text-xs text-slate-500">#{{ row.userId }}</span></template>
        <template #cell-userName="{ row }"><div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.userName }}</div><div class="text-xs text-slate-500">{{ row.nickName }}</div></template>
        <template #cell-roles="{ row }"><span class="block max-w-[220px] truncate" :title="roleNames(row)">{{ roleNames(row) }}</span></template>
        <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" /></template>
        <template #cell-createTime="{ row }">{{ formatDateTime(row.createTime) }}</template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button size="icon" variant="ghost" @click="openDialog(row)"><Edit3 class="h-4 w-4" /></Button><Button size="icon" variant="ghost" @click="openPasswordDialog(row)"><KeyRound class="h-4 w-4" /></Button><Button size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button></div></template>
      </DataTable>
    </Panel>

    <BaseDialog :show="dialogOpen" :title="dialogTitle" width="wide" @close="closeDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <Input v-model="form.userName" label="账号" :disabled="Boolean(editingUser)" required />
        <Input v-model="form.nickName" label="昵称" required />
        <Input v-model="form.email" label="邮箱" type="email" />
        <Input v-model="form.phonenumber" label="手机号" />
        <Input v-if="!editingUser" v-model="form.password" label="登录密码" type="password" placeholder="留空使用系统初始密码" />
        <label class="space-y-2"><span class="text-sm font-medium">性别</span><Select v-model="form.sex" :options="sexOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="form.status" :options="formStatusOptions" /></label>
        <div class="md:col-span-2">
          <div class="mb-2 text-sm font-medium">角色</div>
          <div class="grid gap-2 md:grid-cols-3">
            <label v-for="role in roles" :key="role.roleId" class="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <input class="h-4 w-4 accent-cyan-600" type="checkbox" :checked="form.roleIds?.includes(role.roleId)" @change="toggleRole(role.roleId)" />
              <span>{{ role.roleName }}</span>
            </label>
          </div>
        </div>
        <TextArea v-model="form.remark" class="md:col-span-2" label="备注" :rows="3" />
      </div>
      <template #footer><div class="flex justify-end gap-3"><Button variant="outline" @click="closeDialog">取消</Button><Button :disabled="saving" @click="saveUser"><Save class="h-4 w-4" />保存</Button></div></template>
    </BaseDialog>

    <BaseDialog :show="passwordDialogOpen" title="重置密码" width="narrow" @close="passwordDialogOpen = false">
      <div class="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">重置后原密码立即失效，用户下次登录需先修改密码。</div>
      <Input v-model="newPassword" label="新密码" type="password" required />
      <template #footer><div class="flex justify-end gap-3"><Button variant="outline" @click="passwordDialogOpen = false">取消</Button><Button :disabled="saving" @click="savePassword"><Save class="h-4 w-4" />保存</Button></div></template>
    </BaseDialog>

    <ConfirmDialog :show="Boolean(pendingDelete)" title="删除用户" :message="pendingDelete ? `确认删除用户“${pendingDelete.userName}”？` : ''" confirm-text="删除" danger @cancel="pendingDelete = null" @confirm="confirmDelete" />
  </div>
</template>
