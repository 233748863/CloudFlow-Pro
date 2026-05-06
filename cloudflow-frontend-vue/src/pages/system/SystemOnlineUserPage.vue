<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { LogOut, MonitorCheck, RefreshCcw, RotateCcw, Search, UsersRound } from 'lucide-vue-next'
import {
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
  type OnlineUserItem,
  forceLogoutOnlineUsers,
  getOnlineUserPage
} from '@/services/api/onlineUser'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, getTotal, normalizeRows } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const loading = ref(false)
const loggingOut = ref(false)
const records = ref<OnlineUserItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const selectedTokens = ref<string[]>([])
const pendingLogoutTokens = ref<string[]>([])

const filters = ref({
  username: '',
  nickName: '',
  deptName: '',
  tenantId: ''
})

const query = ref({ ...filters.value })

const columns: Column<OnlineUserItem>[] = [
  { key: 'select', label: '' },
  { key: 'user', label: '用户' },
  { key: 'deptName', label: '部门' },
  { key: 'tenantId', label: '租户' },
  { key: 'roles', label: '角色' },
  { key: 'loginTime', label: '登录时间', sortable: true },
  { key: 'remainingSeconds', label: '剩余有效期', sortable: true },
  { key: 'currentLogin', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const selectableRecords = computed(() => records.value.filter((item) => !item.currentLogin))
const allSelected = computed(() => selectableRecords.value.length > 0 && selectableRecords.value.every((item) => selectedTokens.value.includes(item.token)))
const hasFilters = computed(() => Boolean(query.value.username || query.value.nickName || query.value.deptName || query.value.tenantId))

const summary = computed(() => {
  const current = records.value.filter((item) => item.currentLogin).length
  const expiringSoon = records.value.filter((item) => Number(item.remainingSeconds ?? 0) > 0 && Number(item.remainingSeconds ?? 0) <= 1800).length
  const tenants = new Set(records.value.map((item) => item.tenantId).filter((item) => item !== undefined && item !== null))
  return {
    total: total.value,
    current,
    expiringSoon,
    tenants: tenants.size
  }
})

function formatDateTime(timestamp?: number) {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatDuration(seconds?: number) {
  if (seconds == null) return '-'
  if (seconds <= 0) return '即将过期'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainSeconds = seconds % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}天`)
  if (hours > 0) parts.push(`${hours}小时`)
  if (minutes > 0) parts.push(`${minutes}分钟`)
  if (parts.length === 0) parts.push(`${remainSeconds}秒`)
  return parts.slice(0, 2).join(' ')
}

function remainingTone(seconds?: number) {
  if (seconds == null) return 'text-slate-500'
  if (seconds <= 0) return 'text-red-600 dark:text-red-300'
  if (seconds <= 1800) return 'text-amber-600 dark:text-amber-300'
  return 'text-slate-700 dark:text-slate-200'
}

function avatarText(item: OnlineUserItem) {
  return item.nickName?.slice(0, 1) || item.username?.slice(0, 1) || 'U'
}

function toggleSelect(token: string) {
  selectedTokens.value = selectedTokens.value.includes(token)
    ? selectedTokens.value.filter((item) => item !== token)
    : [...selectedTokens.value, token]
}

function toggleAll() {
  selectedTokens.value = allSelected.value ? [] : selectableRecords.value.map((item) => item.token)
}

async function fetchUsers() {
  loading.value = true
  try {
    const page = await getOnlineUserPage({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      username: query.value.username || undefined,
      nickName: query.value.nickName || undefined,
      deptName: query.value.deptName || undefined,
      tenantId: query.value.tenantId ? Number(query.value.tenantId) : undefined
    })
    records.value = normalizeRows<OnlineUserItem>(page)
    total.value = getTotal<OnlineUserItem>(page, records.value.length)
    selectedTokens.value = []
  } catch (error) {
    records.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '在线用户加载失败'))
  } finally {
    loading.value = false
  }
}

function searchUsers() {
  query.value = {
    username: filters.value.username.trim(),
    nickName: filters.value.nickName.trim(),
    deptName: filters.value.deptName.trim(),
    tenantId: filters.value.tenantId.trim()
  }
  pageNum.value = 1
  void fetchUsers()
}

function resetFilters() {
  filters.value = { username: '', nickName: '', deptName: '', tenantId: '' }
  query.value = { ...filters.value }
  pageNum.value = 1
  void fetchUsers()
}

function requestForceLogout(tokens: string[]) {
  if (tokens.length === 0) {
    toast.error('请选择要强制下线的会话')
    return
  }
  pendingLogoutTokens.value = tokens
}

async function confirmForceLogout() {
  if (pendingLogoutTokens.value.length === 0) return
  loggingOut.value = true
  try {
    const message = await forceLogoutOnlineUsers(pendingLogoutTokens.value)
    pendingLogoutTokens.value = []
    toast.success(message || '强制下线成功')
    await fetchUsers()
  } catch (error) {
    toast.error(getErrorMessage(error, '强制下线失败'))
  } finally {
    loggingOut.value = false
  }
}

watch([pageNum, pageSize], () => {
  void fetchUsers()
})

onMounted(() => {
  void fetchUsers()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <MonitorCheck class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Online Users
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">在线用户</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">查看当前在线会话，支持按账号、昵称、部门和租户筛选并强制下线</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchUsers">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新列表
        </Button>
        <Button variant="danger" :disabled="selectedTokens.length === 0 || loggingOut" @click="requestForceLogout(selectedTokens)">
          <LogOut class="h-4 w-4" />
          批量强退
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">在线会话</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">当前会话</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.current) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">30 分钟内过期</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.expiringSoon) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">本页租户数</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.tenants) }}</div></div>
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_160px_auto]">
        <Input v-model="filters.username" label="账号" placeholder="按账号模糊查询" @enter="searchUsers" />
        <Input v-model="filters.nickName" label="昵称" placeholder="按昵称模糊查询" @enter="searchUsers" />
        <Input v-model="filters.deptName" label="部门" placeholder="按部门模糊查询" @enter="searchUsers" />
        <Input v-model="filters.tenantId" label="租户 ID" type="number" />
        <div class="flex items-end gap-2">
          <Button @click="searchUsers"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel title="在线用户列表">
      <template #icon><UsersRound class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="records" :loading="loading" row-key="token">
        <template #header-select>
          <input class="h-4 w-4 rounded border-slate-300 accent-cyan-600" type="checkbox" :checked="allSelected" @change="toggleAll" />
        </template>
        <template #cell-select="{ row }">
          <input
            class="h-4 w-4 rounded border-slate-300 accent-cyan-600 disabled:opacity-40"
            type="checkbox"
            :disabled="Boolean(row.currentLogin)"
            :checked="selectedTokens.includes(row.token)"
            @change="toggleSelect(row.token)"
          />
        </template>
        <template #cell-user="{ row }">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
              {{ avatarText(row) }}
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-slate-900 dark:text-slate-100">{{ row.username || '-' }}</span>
                <StatusBadge v-if="row.currentLogin" label="当前会话" tone="green" />
              </div>
              <div class="mt-1 text-sm text-slate-500">{{ row.nickName || '-' }}</div>
              <div class="mt-1 max-w-[220px] truncate font-mono text-xs text-slate-400" :title="row.token">Token: {{ row.token.slice(0, 12) }}...</div>
            </div>
          </div>
        </template>
        <template #cell-deptName="{ row }">{{ row.deptName || '-' }}</template>
        <template #cell-tenantId="{ row }">{{ row.tenantId ?? '-' }}</template>
        <template #cell-roles="{ row }">
          <span class="block max-w-[240px] truncate" :title="row.roles?.join('、') || ''">{{ row.roles?.length ? row.roles.join('、') : '-' }}</span>
        </template>
        <template #cell-loginTime="{ row }">{{ formatDateTime(row.loginTime) }}</template>
        <template #cell-remainingSeconds="{ row }">
          <span class="font-medium" :class="remainingTone(row.remainingSeconds)">{{ formatDuration(row.remainingSeconds) }}</span>
        </template>
        <template #cell-currentLogin="{ row }">
          <StatusBadge :label="row.currentLogin ? '当前在线' : '在线'" :tone="row.currentLogin ? 'green' : 'slate'" />
        </template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" :disabled="Boolean(row.currentLogin)" @click="requestForceLogout([row.token])">
              <LogOut class="h-4 w-4 text-red-500" />
            </Button>
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

    <ConfirmDialog
      :show="pendingLogoutTokens.length > 0"
      title="确认强制下线"
      :message="pendingLogoutTokens.length > 1 ? `确定强制下线选中的 ${pendingLogoutTokens.length} 个会话吗？` : '确定强制下线这个会话吗？'"
      confirm-text="确认强退"
      danger
      @cancel="pendingLogoutTokens = []"
      @confirm="confirmForceLogout"
    />
  </div>
</template>
