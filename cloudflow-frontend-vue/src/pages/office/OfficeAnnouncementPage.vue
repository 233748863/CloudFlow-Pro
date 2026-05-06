<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bell, Eye, Megaphone, Plus, RefreshCcw, RotateCcw, Save, Search, Trash2 } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, EmptyState, Input, Pagination, Panel, Select, StatusBadge, TextArea, type SelectOption } from '@/components/common'
import { getMyAnnouncements, markAnnouncementRead } from '@/services/api/announcement'
import { deleteAnnouncement, getOaTotal, listAnnouncementManage, normalizeOaRows, publishAnnouncement, revokeAnnouncement, toggleAnnouncementTop, updateAnnouncement, type OaRecord } from '@/services/api/oa'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { Announcement } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const auth = useAuthStore()

const loading = ref(false)
const saving = ref(false)
const activeTab = ref<'mine' | 'manage'>('mine')
const myRows = ref<Announcement[]>([])
const manageRows = ref<OaRecord[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = ref({ title: '', type: '', status: '' })
const dialogOpen = ref(false)
const detailRow = ref<Announcement | OaRecord | null>(null)
const editingRow = ref<OaRecord | null>(null)
const pendingDelete = ref<OaRecord | null>(null)

const typeOptions: SelectOption[] = [
  { value: '', label: '全部类型' },
  { value: '1', label: '通知' },
  { value: '2', label: '公告' },
  { value: '3', label: '紧急' }
]

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '草稿' },
  { value: '1', label: '已发布' },
  { value: '2', label: '已撤销' }
]

const priorityOptions: SelectOption[] = [
  { value: 'L', label: '低' },
  { value: 'M', label: '中' },
  { value: 'H', label: '高' }
]

const scopeOptions: SelectOption[] = [
  { value: 'ALL', label: '全员' },
  { value: 'DEPT', label: '部门' },
  { value: 'ROLE', label: '角色' }
]

const form = ref<OaRecord>({
  title: '',
  content: '',
  type: '2',
  scopeType: 'ALL',
  scopeValue: '',
  priority: 'M',
  isTop: 0,
  expireTime: ''
})

const canManage = computed(() => auth.isAdmin || ['HR', 'MANAGER'].includes(String(auth.user?.role || '').toUpperCase()))
const unreadCount = computed(() => myRows.value.filter((item) => !item.isRead).length)

function optionLabel(options: SelectOption[], value: unknown) {
  return options.find((item) => String(item.value) === String(value))?.label || String(value ?? '-')
}

function toneByStatus(value: unknown) {
  if (String(value) === '1') return 'green'
  if (String(value) === '2') return 'red'
  return 'yellow'
}

function excerpt(value?: string) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || '暂无内容'
}

function idOf(row: Announcement | OaRecord) {
  return row.announcementId as number | undefined
}

function formText(key: string) {
  const value = form.value[key]
  return value === undefined || value === null ? '' : String(value)
}

function formSelectValue(key: string) {
  const value = form.value[key]
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  return ''
}

function setFormValue(key: string, value: string | number | boolean | null) {
  form.value[key] = value
}

function openCreate() {
  editingRow.value = null
  form.value = {
    title: '',
    content: '',
    type: '2',
    scopeType: 'ALL',
    scopeValue: '',
    priority: 'M',
    isTop: 0,
    expireTime: ''
  }
  dialogOpen.value = true
}

function openEdit(row: OaRecord) {
  editingRow.value = row
  form.value = {
    announcementId: row.announcementId,
    title: row.title || '',
    content: row.content || '',
    type: row.type || '2',
    scopeType: row.scopeType || 'ALL',
    scopeValue: row.scopeValue || '',
    priority: row.priority || 'M',
    isTop: Number(row.isTop || 0),
    expireTime: row.expireTime ? String(row.expireTime).replace(' ', 'T').slice(0, 16) : ''
  }
  dialogOpen.value = true
}

async function openDetail(row: Announcement | OaRecord) {
  detailRow.value = row
  const id = idOf(row)
  if (id && activeTab.value === 'mine' && !(row as Announcement).isRead) {
    try {
      await markAnnouncementRead(id)
      myRows.value = myRows.value.map((item) => item.announcementId === id ? { ...item, isRead: true } : item)
    } catch {
      // ignore read state failure
    }
  }
}

async function fetchMine() {
  loading.value = true
  try {
    myRows.value = await getMyAnnouncements()
  } catch (error) {
    myRows.value = []
    toast.error(getErrorMessage(error, '我的公告加载失败'))
  } finally {
    loading.value = false
  }
}

async function fetchManage() {
  loading.value = true
  try {
    const data = await listAnnouncementManage({
      page: pageNum.value,
      size: pageSize.value,
      title: filters.value.title || undefined,
      type: filters.value.type || undefined,
      status: filters.value.status || undefined
    })
    manageRows.value = normalizeOaRows(data)
    total.value = getOaTotal(data, manageRows.value.length)
  } catch (error) {
    manageRows.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '公告管理加载失败'))
  } finally {
    loading.value = false
  }
}

async function fetchRows() {
  if (activeTab.value === 'mine') await fetchMine()
  else await fetchManage()
}

async function saveRow() {
  if (!String(form.value.title || '').trim()) {
    toast.error('请填写公告标题')
    return
  }
  saving.value = true
  try {
    const payload = {
      ...form.value,
      expireTime: form.value.expireTime ? String(form.value.expireTime).replace('T', ' ') + ':00' : undefined
    }
    if (editingRow.value) await updateAnnouncement(payload)
    else await publishAnnouncement(payload)
    dialogOpen.value = false
    toast.success('保存成功')
    await fetchManage()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function revoke(row: OaRecord) {
  const id = row.announcementId
  if (!id) return
  saving.value = true
  try {
    await revokeAnnouncement(String(id))
    toast.success('撤销成功')
    await fetchManage()
  } catch (error) {
    toast.error(getErrorMessage(error, '撤销失败'))
  } finally {
    saving.value = false
  }
}

async function toggleTop(row: OaRecord) {
  const id = row.announcementId
  if (!id) return
  saving.value = true
  try {
    await toggleAnnouncementTop(String(id))
    toast.success('置顶状态已更新')
    await fetchManage()
  } catch (error) {
    toast.error(getErrorMessage(error, '更新置顶失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  const id = pendingDelete.value?.announcementId
  if (!id) return
  saving.value = true
  try {
    await deleteAnnouncement(String(id))
    pendingDelete.value = null
    toast.success('删除成功')
    await fetchManage()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    saving.value = false
  }
}

function searchRows() {
  pageNum.value = 1
  void fetchManage()
}

function resetFilters() {
  filters.value = { title: '', type: '', status: '' }
  pageNum.value = 1
  void fetchManage()
}

watch(activeTab, () => void fetchRows())
watch([pageNum, pageSize], () => activeTab.value === 'manage' && void fetchManage())

onMounted(() => void fetchRows())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Megaphone class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Office Announcement
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">公告中心</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">查看公告通知，管理员可发布、撤销和置顶公告</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchRows"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button v-if="canManage" @click="openCreate"><Plus class="h-4 w-4" />发布公告</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <div class="card p-4"><div class="text-xs text-slate-500">我的公告</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(myRows.length) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">未读</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(unreadCount) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">管理列表</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(total) }}</div></div>
    </div>

    <Panel title="公告列表">
      <template #icon><Bell class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <div class="tabs">
          <button class="tab" :class="activeTab === 'mine' && 'tab-active'" @click="activeTab = 'mine'">我的公告</button>
          <button v-if="canManage" class="tab" :class="activeTab === 'manage' && 'tab-active'" @click="activeTab = 'manage'">公告管理</button>
        </div>
      </template>

      <div v-if="activeTab === 'manage'" class="mb-4 grid gap-3 lg:grid-cols-[1fr_160px_160px_auto]">
        <Input v-model="filters.title" label="标题" placeholder="按标题搜索" @enter="searchRows" />
        <label class="space-y-1.5"><span class="text-sm font-medium">类型</span><Select v-model="filters.type" :options="typeOptions" /></label>
        <label class="space-y-1.5"><span class="text-sm font-medium">状态</span><Select v-model="filters.status" :options="statusOptions" /></label>
        <div class="flex items-end gap-2"><Button @click="searchRows"><Search class="h-4 w-4" />查询</Button><Button variant="outline" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button></div>
      </div>

      <div v-if="activeTab === 'mine'">
        <div v-if="myRows.length" class="space-y-3">
          <button v-for="row in myRows" :key="row.announcementId" class="flex w-full items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-200 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950/70" @click="openDetail(row)">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-slate-900 dark:text-slate-100">{{ row.title }}</span>
                <StatusBadge :label="optionLabel(typeOptions, row.type)" tone="cyan" />
                <StatusBadge :label="row.isRead ? '已读' : '未读'" :tone="row.isRead ? 'slate' : 'yellow'" />
              </div>
              <p class="mt-2 line-clamp-2 text-sm text-slate-500">{{ excerpt(row.content) }}</p>
            </div>
            <div class="shrink-0 text-xs text-slate-400">{{ row.publishTime || row.createTime }}</div>
          </button>
        </div>
        <EmptyState v-else title="暂无公告" description="公告发布后会显示在这里" />
      </div>

      <div v-else>
        <div v-if="manageRows.length" class="space-y-3">
          <div v-for="row in manageRows" :key="String(row.announcementId)" class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate font-semibold text-slate-900 dark:text-slate-100">{{ row.title }}</h3>
                  <StatusBadge :label="optionLabel(typeOptions, row.type)" tone="cyan" />
                  <StatusBadge :label="optionLabel(statusOptions, row.status)" :tone="toneByStatus(row.status)" />
                  <StatusBadge v-if="Number(row.isTop) === 1" label="置顶" tone="yellow" />
                </div>
                <p class="mt-2 line-clamp-2 text-sm text-slate-500">{{ excerpt(String(row.content || '')) }}</p>
              </div>
              <div class="flex flex-wrap justify-end gap-1">
                <Button size="icon" variant="ghost" @click="openDetail(row)"><Eye class="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" @click="toggleTop(row)">置顶</Button>
                <Button size="sm" variant="warning" :disabled="String(row.status) === '2'" @click="revoke(row)">撤销</Button>
                <Button size="sm" variant="outline" @click="openEdit(row)">编辑</Button>
                <Button size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else title="暂无公告" description="可以发布第一条公告" />
        <Pagination v-if="total > 0" v-model:page="pageNum" v-model:page-size="pageSize" :total="total" />
      </div>
    </Panel>

    <BaseDialog :show="dialogOpen" :title="editingRow ? '编辑公告' : '发布公告'" width="wide" @close="dialogOpen = false">
      <div class="grid gap-4 md:grid-cols-2">
        <Input :model-value="formText('title')" label="标题" required class="md:col-span-2" @update:model-value="setFormValue('title', $event)" />
        <label class="space-y-2"><span class="text-sm font-medium">类型</span><Select :model-value="formSelectValue('type')" :options="typeOptions.filter((item) => item.value !== '')" @update:model-value="setFormValue('type', $event)" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">优先级</span><Select :model-value="formSelectValue('priority')" :options="priorityOptions" @update:model-value="setFormValue('priority', $event)" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">范围</span><Select :model-value="formSelectValue('scopeType')" :options="scopeOptions" @update:model-value="setFormValue('scopeType', $event)" /></label>
        <Input :model-value="formText('scopeValue')" label="范围值" placeholder="部门ID/角色ID，可为空" @update:model-value="setFormValue('scopeValue', $event)" />
        <Input :model-value="formText('expireTime')" label="过期时间" type="datetime-local" @update:model-value="setFormValue('expireTime', $event)" />
        <label class="space-y-2"><span class="text-sm font-medium">置顶</span><Select :model-value="formSelectValue('isTop')" :options="[{ value: 0, label: '否' }, { value: 1, label: '是' }]" @update:model-value="setFormValue('isTop', $event)" /></label>
        <TextArea :model-value="formText('content')" label="内容" required class="md:col-span-2" :rows="8" @update:model-value="setFormValue('content', $event)" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3"><Button variant="outline" @click="dialogOpen = false">取消</Button><Button :disabled="saving" @click="saveRow"><Save class="h-4 w-4" />保存</Button></div>
      </template>
    </BaseDialog>

    <BaseDialog :show="Boolean(detailRow)" :title="String(detailRow?.title || '公告详情')" width="wide" @close="detailRow = null">
      <div v-if="detailRow" class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :label="optionLabel(typeOptions, detailRow.type)" tone="cyan" />
          <StatusBadge v-if="'isRead' in detailRow" :label="detailRow.isRead ? '已读' : '未读'" :tone="detailRow.isRead ? 'slate' : 'yellow'" />
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">{{ excerpt(String(detailRow.content || '')) }}</div>
      </div>
    </BaseDialog>

    <ConfirmDialog :show="Boolean(pendingDelete)" title="删除公告" :message="pendingDelete ? `确认删除“${pendingDelete.title}”？` : ''" confirm-text="删除" danger @cancel="pendingDelete = null" @confirm="confirmDelete" />
  </div>
</template>
