<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BriefcaseBusiness, Edit3, Plus, RefreshCcw, RotateCcw, Save, Search, Trash2 } from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Pagination,
  Panel,
  Select,
  StatusBadge,
  TextArea,
  type Column,
  type SelectOption
} from '@/components/common'
import {
  type SysPost,
  addPost,
  deletePost,
  getPostList,
  updatePost
} from '@/services/api/system'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, getTotal, normalizeRows, statusTone } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const posts = ref<SysPost[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const dialogOpen = ref(false)
const editingPost = ref<SysPost | null>(null)
const pendingDelete = ref<SysPost | null>(null)

const filters = ref({
  postCode: '',
  postName: '',
  status: ''
})

const query = ref({
  postCode: '',
  postName: '',
  status: ''
})

const form = ref<SysPost>({
  postCode: '',
  postName: '',
  postSort: 0,
  status: '0',
  remark: ''
})

const columns: Column<SysPost>[] = [
  { key: 'postId', label: 'ID', sortable: true },
  { key: 'postCode', label: '岗位编码' },
  { key: 'postName', label: '岗位名称' },
  { key: 'postSort', label: '排序', sortable: true },
  { key: 'status', label: '状态' },
  { key: 'createTime', label: '创建时间', sortable: true },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '停用' }
]

const formStatusOptions: SelectOption[] = [
  { value: '0', label: '正常' },
  { value: '1', label: '停用' }
]

const summary = computed(() => ({
  total: total.value,
  active: posts.value.filter((item) => item.status === '0').length,
  disabled: posts.value.filter((item) => item.status === '1').length,
  maxSort: posts.value.reduce((max, item) => Math.max(max, Number(item.postSort || 0)), 0)
}))

const hasFilters = computed(() => Boolean(query.value.postCode || query.value.postName || query.value.status))
const dialogTitle = computed(() => editingPost.value ? '编辑岗位' : '新增岗位')

function statusLabel(status?: string) {
  return status === '1' ? '停用' : '正常'
}

function formatDateTime(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
}

async function fetchPosts() {
  loading.value = true
  try {
    const page = await getPostList({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      postCode: query.value.postCode || undefined,
      postName: query.value.postName || undefined,
      status: query.value.status || undefined
    })
    posts.value = normalizeRows<SysPost>(page)
    total.value = getTotal<SysPost>(page, posts.value.length)
  } catch (error) {
    posts.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '岗位列表加载失败'))
  } finally {
    loading.value = false
  }
}

function searchPosts() {
  query.value = {
    postCode: filters.value.postCode.trim(),
    postName: filters.value.postName.trim(),
    status: filters.value.status
  }
  pageNum.value = 1
  void fetchPosts()
}

function resetFilters() {
  filters.value = { postCode: '', postName: '', status: '' }
  query.value = { postCode: '', postName: '', status: '' }
  pageNum.value = 1
  void fetchPosts()
}

function openDialog(post?: SysPost) {
  editingPost.value = post || null
  form.value = {
    postId: post?.postId,
    postCode: post?.postCode || '',
    postName: post?.postName || '',
    postSort: Number(post?.postSort || 0),
    status: post?.status || '0',
    remark: post?.remark || ''
  }
  dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  editingPost.value = null
}

async function savePost() {
  if (!form.value.postCode.trim()) {
    toast.error('请输入岗位编码')
    return
  }
  if (!form.value.postName.trim()) {
    toast.error('请输入岗位名称')
    return
  }

  saving.value = true
  try {
    const payload: SysPost = {
      ...form.value,
      postCode: form.value.postCode.trim(),
      postName: form.value.postName.trim(),
      postSort: Number(form.value.postSort || 0),
      remark: form.value.remark?.trim() || ''
    }
    if (editingPost.value?.postId) await updatePost({ ...payload, postId: editingPost.value.postId })
    else await addPost(payload)
    closeDialog()
    toast.success('保存成功')
    await fetchPosts()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存岗位失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value?.postId) return
  saving.value = true
  try {
    await deletePost([pendingDelete.value.postId])
    const nextPage = posts.value.length === 1 && pageNum.value > 1 ? pageNum.value - 1 : pageNum.value
    pendingDelete.value = null
    pageNum.value = nextPage
    toast.success('删除成功')
    await fetchPosts()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除岗位失败'))
  } finally {
    saving.value = false
  }
}

watch([pageNum, pageSize], () => {
  void fetchPosts()
})

onMounted(() => {
  void fetchPosts()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <BriefcaseBusiness class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          System Post
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">岗位管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">维护系统岗位主数据，供员工档案、编制、职位与排班模块复用</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchPosts">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新
        </Button>
        <Button @click="openDialog()">
          <Plus class="h-4 w-4" />
          新增岗位
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">岗位总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">正常岗位</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.active) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">停用岗位</div><div class="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-300">{{ formatNumber(summary.disabled) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">当前最大排序</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.maxSort) }}</div></div>
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_auto]">
        <Input v-model="filters.postCode" label="岗位编码" placeholder="按编码模糊查询" @enter="searchPosts" />
        <Input v-model="filters.postName" label="岗位名称" placeholder="按名称模糊查询" @enter="searchPosts" />
        <label class="space-y-2">
          <span class="text-sm font-medium">状态</span>
          <Select v-model="filters.status" :options="statusOptions" />
        </label>
        <div class="flex items-end gap-2">
          <Button @click="searchPosts"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel title="岗位列表">
      <template #icon><BriefcaseBusiness class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="posts" :loading="loading" row-key="postId">
        <template #cell-postId="{ row }"><span class="font-mono text-xs text-slate-500">#{{ row.postId }}</span></template>
        <template #cell-postCode="{ row }"><span class="font-semibold text-slate-900 dark:text-slate-100">{{ row.postCode }}</span></template>
        <template #cell-postName="{ row }">
          <div class="font-medium text-slate-900 dark:text-slate-100">{{ row.postName }}</div>
          <div class="max-w-[280px] truncate text-xs text-slate-500">{{ row.remark || '-' }}</div>
        </template>
        <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status === '0' ? 'ACTIVE' : 'DISABLED')" /></template>
        <template #cell-createTime="{ row }">{{ formatDateTime(row.createTime) }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openDialog(row)"><Edit3 class="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button>
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

    <BaseDialog :show="dialogOpen" :title="dialogTitle" width="wide" @close="closeDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <Input v-model="form.postCode" label="岗位编码" :disabled="Boolean(editingPost)" required />
        <Input v-model="form.postName" label="岗位名称" required />
        <Input v-model="form.postSort" label="显示排序" type="number" />
        <label class="space-y-2">
          <span class="text-sm font-medium">状态</span>
          <Select v-model="form.status" :options="formStatusOptions" />
        </label>
        <TextArea v-model="form.remark" class="md:col-span-2" label="备注" :rows="4" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeDialog">取消</Button>
          <Button :disabled="saving" @click="savePost"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(pendingDelete)"
      title="删除岗位"
      :message="pendingDelete ? `确认删除岗位“${pendingDelete.postName}”？删除后将无法恢复。` : ''"
      confirm-text="删除"
      danger
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
