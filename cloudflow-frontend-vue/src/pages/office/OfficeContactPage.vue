<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Building2, Mail, Phone, RefreshCcw, RotateCcw, Search, UserRound, UsersRound } from 'lucide-vue-next'
import { Button, EmptyState, Input, Pagination, Panel, StatusBadge } from '@/components/common'
import { getContactDeptTree, getContactDetail, getOaTotal, listContacts, normalizeOaRows, type OaRecord } from '@/services/api/oa'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'

interface DeptNode extends OaRecord {
  deptId?: number
  id?: number
  parentId?: number
  deptName?: string
  name?: string
}

const toast = useToastStore()
const loading = ref(false)
const detailLoading = ref(false)
const rows = ref<OaRecord[]>([])
const depts = ref<DeptNode[]>([])
const selectedDeptId = ref<number | ''>('')
const selectedUser = ref<OaRecord | null>(null)
const keyword = ref('')
const pageNum = ref(1)
const pageSize = ref(12)
const total = ref(0)

const activeDeptName = computed(() => {
  if (!selectedDeptId.value) return '全部部门'
  const node = depts.value.find((item) => Number(item.deptId ?? item.id) === Number(selectedDeptId.value))
  return String(node?.deptName || node?.name || '当前部门')
})

const stats = computed(() => ({
  total: total.value,
  current: rows.value.length,
  departments: depts.value.length
}))

function userIdOf(row: OaRecord) {
  return row.userId ?? row.id ?? row.user_id
}

function display(row: OaRecord, keys: string[], fallback = '-') {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value)
  }
  return fallback
}

async function fetchContacts() {
  loading.value = true
  try {
    const data = await listContacts({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      deptId: selectedDeptId.value || undefined
    })
    rows.value = normalizeOaRows(data)
    total.value = getOaTotal(data, rows.value.length)
    if (!selectedUser.value && rows.value.length) selectedUser.value = rows.value[0]
  } catch (error) {
    rows.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '通讯录加载失败'))
  } finally {
    loading.value = false
  }
}

async function fetchDepts() {
  try {
    depts.value = await getContactDeptTree<DeptNode>()
  } catch {
    depts.value = []
  }
}

async function openDetail(row: OaRecord) {
  selectedUser.value = row
  const userId = userIdOf(row)
  if (!userId) return
  detailLoading.value = true
  try {
    selectedUser.value = await getContactDetail<OaRecord>(String(userId))
  } catch (error) {
    toast.error(getErrorMessage(error, '联系人详情加载失败'))
  } finally {
    detailLoading.value = false
  }
}

function searchRows() {
  pageNum.value = 1
  void fetchContacts()
}

function resetFilters() {
  keyword.value = ''
  selectedDeptId.value = ''
  pageNum.value = 1
  void fetchContacts()
}

watch([pageNum, pageSize], () => void fetchContacts())

onMounted(() => {
  void fetchDepts()
  void fetchContacts()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <UsersRound class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Office Contact
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">通讯录</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">按姓名、部门和职位查找内部联系人</p>
      </div>
      <Button variant="outline" :disabled="loading" @click="fetchContacts">
        <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <div class="card p-4"><div class="text-xs text-slate-500">联系人</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(stats.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">本页</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(stats.current) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">部门</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(stats.departments) }}</div></div>
    </div>

    <Panel title="查询">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 lg:grid-cols-[1fr_auto]">
        <Input v-model="keyword" label="关键字" placeholder="姓名/账号/部门/职位" @enter="searchRows" />
        <div class="flex items-end gap-2">
          <Button @click="searchRows"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <div class="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <Panel title="部门">
        <template #icon><Building2 class="h-4 w-4 text-slate-500" /></template>
        <div class="space-y-2">
          <button class="w-full rounded-xl px-3 py-2 text-left text-sm transition" :class="!selectedDeptId ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-200' : 'hover:bg-slate-50 dark:hover:bg-slate-900'" @click="selectedDeptId = ''; searchRows()">全部部门</button>
          <button v-for="dept in depts" :key="String(dept.deptId ?? dept.id)" class="w-full rounded-xl px-3 py-2 text-left text-sm transition" :class="Number(selectedDeptId) === Number(dept.deptId ?? dept.id) ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-200' : 'hover:bg-slate-50 dark:hover:bg-slate-900'" @click="selectedDeptId = Number(dept.deptId ?? dept.id); searchRows()">
            {{ dept.deptName || dept.name || `部门 ${dept.deptId ?? dept.id}` }}
          </button>
        </div>
      </Panel>

      <Panel :title="activeDeptName">
        <template #icon><UsersRound class="h-4 w-4 text-slate-500" /></template>
        <div v-if="rows.length" class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          <button v-for="row in rows" :key="String(userIdOf(row) || display(row, ['userName', 'nickName']))" class="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-200 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-teal-900" @click="openDetail(row)">
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">
                <UserRound class="h-5 w-5" />
              </div>
              <div class="min-w-0">
                <div class="truncate font-semibold text-slate-900 dark:text-slate-100">{{ display(row, ['nickName', 'userName', 'name']) }}</div>
                <div class="mt-1 truncate text-sm text-slate-500">{{ display(row, ['deptName', 'department']) }} · {{ display(row, ['postName', 'position'], '员工') }}</div>
                <div class="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span class="inline-flex items-center gap-1"><Phone class="h-3.5 w-3.5" />{{ display(row, ['phonenumber', 'phone', 'mobile']) }}</span>
                  <span class="inline-flex items-center gap-1"><Mail class="h-3.5 w-3.5" />{{ display(row, ['email']) }}</span>
                </div>
              </div>
            </div>
          </button>
        </div>
        <EmptyState v-else title="暂无联系人" description="调整关键字或部门后重试" />
        <Pagination v-if="total > 0" v-model:page="pageNum" v-model:page-size="pageSize" :total="total" :page-size-options="[12, 24, 48]" @update:page-size="pageNum = 1" />
      </Panel>

      <Panel title="联系人详情">
        <template #icon><UserRound class="h-4 w-4 text-slate-500" /></template>
        <div v-if="selectedUser" class="space-y-4" :class="detailLoading ? 'opacity-60' : ''">
          <div class="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/60">
            <div class="text-xl font-semibold text-slate-900 dark:text-slate-100">{{ display(selectedUser, ['nickName', 'userName', 'name']) }}</div>
            <div class="mt-1 text-sm text-slate-500">{{ display(selectedUser, ['deptName', 'department']) }} · {{ display(selectedUser, ['postName', 'position'], '员工') }}</div>
          </div>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3"><span class="text-slate-500">手机</span><span>{{ display(selectedUser, ['phonenumber', 'phone', 'mobile']) }}</span></div>
            <div class="flex items-center justify-between gap-3"><span class="text-slate-500">邮箱</span><span class="truncate">{{ display(selectedUser, ['email']) }}</span></div>
            <div class="flex items-center justify-between gap-3"><span class="text-slate-500">账号</span><span>{{ display(selectedUser, ['userName', 'username', 'loginName']) }}</span></div>
            <div class="flex items-center justify-between gap-3"><span class="text-slate-500">状态</span><StatusBadge :label="display(selectedUser, ['status'], '正常')" tone="green" /></div>
          </div>
        </div>
        <EmptyState v-else title="请选择联系人" description="联系人详情会显示在这里" />
      </Panel>
    </div>
  </div>
</template>
