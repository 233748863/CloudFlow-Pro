<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BookOpen, Eye, FileText, Plus, RefreshCcw, RotateCcw, Save, Search, Send, Trash2, Undo2 } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, EmptyState, Input, Pagination, Panel, Select, StatusBadge, TextArea, type SelectOption } from '@/components/common'
import { createKnowledge, deleteKnowledge, getOaTotal, listKnowledgeMy, listKnowledgeSubmissions, normalizeOaRows, readKnowledge, recallKnowledge, submitKnowledge, updateKnowledge, type OaRecord } from '@/services/api/oa'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'

const toast = useToastStore()

const loading = ref(false)
const saving = ref(false)
const activeTab = ref<'readable' | 'mine'>('readable')
const readableRows = ref<OaRecord[]>([])
const myRows = ref<OaRecord[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = ref({ keyword: '', category: '', status: '', unreadOnly: false })
const detailRow = ref<OaRecord | null>(null)
const editingRow = ref<OaRecord | null>(null)
const dialogOpen = ref(false)
const pendingDelete = ref<OaRecord | null>(null)

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '审批中' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'RECALLED', label: '已撤回' }
]

const categoryOptions: SelectOption[] = [
  { value: '', label: '全部分类' },
  { value: '制度流程', label: '制度流程' },
  { value: '产品资料', label: '产品资料' },
  { value: '技术文档', label: '技术文档' },
  { value: '常见问题', label: '常见问题' }
]

const scopeOptions: SelectOption[] = [
  { value: 'ALL', label: '全员' },
  { value: 'DEPT', label: '部门' },
  { value: 'ROLE', label: '角色' }
]

const form = ref<OaRecord>({
  title: '',
  category: '制度流程',
  summary: '',
  content: '',
  scopeType: 'ALL',
  scopeValue: '',
  attachmentUrl: ''
})

const unreadCount = computed(() => readableRows.value.filter((item) => item.isRead === false).length)

function docId(row: OaRecord) {
  return row.documentId ?? row.id
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

function statusTone(value: unknown) {
  const status = String(value || '').toUpperCase()
  if (['PUBLISHED', 'APPROVED'].includes(status)) return 'green'
  if (['PENDING', 'DRAFT'].includes(status)) return 'yellow'
  if (['REJECTED', 'RECALLED'].includes(status)) return 'red'
  return 'slate'
}

function excerpt(value?: unknown, length = 120) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length) || '暂无内容'
}

function openCreate() {
  editingRow.value = null
  form.value = {
    title: '',
    category: '制度流程',
    summary: '',
    content: '',
    scopeType: 'ALL',
    scopeValue: '',
    attachmentUrl: ''
  }
  dialogOpen.value = true
}

function openEdit(row: OaRecord) {
  editingRow.value = row
  form.value = {
    documentId: row.documentId,
    title: row.title || '',
    category: row.category || '制度流程',
    summary: row.summary || '',
    content: row.content || '',
    scopeType: row.scopeType || 'ALL',
    scopeValue: row.scopeValue || '',
    attachmentUrl: row.attachmentUrl || ''
  }
  dialogOpen.value = true
}

async function openDetail(row: OaRecord) {
  detailRow.value = row
  const id = docId(row)
  if (id && row.isRead === false) {
    try {
      await readKnowledge(String(id))
      readableRows.value = readableRows.value.map((item) => docId(item) === id ? { ...item, isRead: true } : item)
      detailRow.value = { ...row, isRead: true }
    } catch {
      // ignore read state failure
    }
  }
}

async function fetchReadable() {
  loading.value = true
  try {
    readableRows.value = await listKnowledgeMy({
      keyword: filters.value.keyword || undefined,
      category: filters.value.category || undefined,
      unreadOnly: filters.value.unreadOnly || undefined
    })
  } catch (error) {
    readableRows.value = []
    toast.error(getErrorMessage(error, '知识库加载失败'))
  } finally {
    loading.value = false
  }
}

async function fetchMine() {
  loading.value = true
  try {
    const data = await listKnowledgeSubmissions({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: filters.value.keyword || undefined,
      category: filters.value.category || undefined,
      status: filters.value.status || undefined
    })
    myRows.value = normalizeOaRows(data)
    total.value = getOaTotal(data, myRows.value.length)
  } catch (error) {
    myRows.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '我的知识文档加载失败'))
  } finally {
    loading.value = false
  }
}

async function fetchRows() {
  if (activeTab.value === 'readable') await fetchReadable()
  else await fetchMine()
}

async function saveRow() {
  if (!String(form.value.title || '').trim()) {
    toast.error('请填写标题')
    return
  }
  saving.value = true
  try {
    if (editingRow.value) await updateKnowledge(form.value)
    else await createKnowledge(form.value)
    dialogOpen.value = false
    toast.success('保存成功')
    await fetchMine()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function submitRow(row: OaRecord) {
  const id = docId(row)
  if (!id) return
  saving.value = true
  try {
    await submitKnowledge(String(id))
    toast.success('提交成功')
    await fetchMine()
  } catch (error) {
    toast.error(getErrorMessage(error, '提交失败'))
  } finally {
    saving.value = false
  }
}

async function recallRow(row: OaRecord) {
  const id = docId(row)
  if (!id) return
  saving.value = true
  try {
    await recallKnowledge(String(id))
    toast.success('撤回成功')
    await fetchMine()
  } catch (error) {
    toast.error(getErrorMessage(error, '撤回失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  const id = pendingDelete.value ? docId(pendingDelete.value) : ''
  if (!id) return
  saving.value = true
  try {
    await deleteKnowledge(String(id))
    pendingDelete.value = null
    toast.success('删除成功')
    await fetchMine()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    saving.value = false
  }
}

function searchRows() {
  pageNum.value = 1
  void fetchRows()
}

function resetFilters() {
  filters.value = { keyword: '', category: '', status: '', unreadOnly: false }
  pageNum.value = 1
  void fetchRows()
}

watch(activeTab, () => void fetchRows())
watch([pageNum, pageSize], () => activeTab.value === 'mine' && void fetchMine())

onMounted(() => void fetchRows())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <BookOpen class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Office Knowledge
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">知识库</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">沉淀制度流程、产品资料、技术文档和常见问题</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchRows"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="openCreate"><Plus class="h-4 w-4" />新建文档</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <div class="card p-4"><div class="text-xs text-slate-500">可读文档</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(readableRows.length) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">未读</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(unreadCount) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">我的提交</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(total) }}</div></div>
    </div>

    <Panel title="文档查询">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
        <Input v-model="filters.keyword" label="关键字" placeholder="标题/摘要/内容" @enter="searchRows" />
        <label class="space-y-1.5"><span class="text-sm font-medium">分类</span><Select v-model="filters.category" :options="categoryOptions" /></label>
        <label class="space-y-1.5"><span class="text-sm font-medium">状态</span><Select v-model="filters.status" :options="statusOptions" :disabled="activeTab === 'readable'" /></label>
        <div class="flex items-end gap-2"><Button @click="searchRows"><Search class="h-4 w-4" />查询</Button><Button variant="outline" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button></div>
      </div>
    </Panel>

    <Panel title="知识文档">
      <template #icon><FileText class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <div class="tabs">
          <button class="tab" :class="activeTab === 'readable' && 'tab-active'" @click="activeTab = 'readable'">可读文档</button>
          <button class="tab" :class="activeTab === 'mine' && 'tab-active'" @click="activeTab = 'mine'">我的提交</button>
        </div>
      </template>

      <div v-if="activeTab === 'readable'">
        <div v-if="readableRows.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <button v-for="row in readableRows" :key="String(docId(row))" class="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-200 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950/70" @click="openDetail(row)">
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge :label="String(row.category || '未分类')" tone="cyan" />
              <StatusBadge :label="row.isRead === false ? '未读' : '已读'" :tone="row.isRead === false ? 'yellow' : 'slate'" />
            </div>
            <h3 class="mt-3 line-clamp-2 font-semibold text-slate-900 dark:text-slate-100">{{ row.title }}</h3>
            <p class="mt-2 line-clamp-3 text-sm text-slate-500">{{ excerpt(row.summary || row.content) }}</p>
          </button>
        </div>
        <EmptyState v-else title="暂无可读文档" description="发布后的知识文档会显示在这里" />
      </div>

      <div v-else>
        <div v-if="myRows.length" class="space-y-3">
          <div v-for="row in myRows" :key="String(docId(row))" class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate font-semibold text-slate-900 dark:text-slate-100">{{ row.title }}</h3>
                  <StatusBadge :label="String(row.category || '未分类')" tone="cyan" />
                  <StatusBadge :label="String(row.status || 'DRAFT')" :tone="statusTone(row.status)" />
                </div>
                <p class="mt-2 line-clamp-2 text-sm text-slate-500">{{ excerpt(row.summary || row.content) }}</p>
              </div>
              <div class="flex flex-wrap justify-end gap-1">
                <Button size="icon" variant="ghost" @click="openDetail(row)"><Eye class="h-4 w-4" /></Button>
                <Button size="sm" variant="success" :disabled="!['DRAFT', 'RECALLED', 'REJECTED'].includes(String(row.status || 'DRAFT'))" @click="submitRow(row)"><Send class="h-3.5 w-3.5" />提交</Button>
                <Button size="sm" variant="warning" :disabled="String(row.status) !== 'PENDING'" @click="recallRow(row)"><Undo2 class="h-3.5 w-3.5" />撤回</Button>
                <Button size="sm" variant="outline" @click="openEdit(row)">编辑</Button>
                <Button size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else title="暂无提交记录" description="可以新建文档草稿后提交发布审批" />
        <Pagination v-if="total > 0" v-model:page="pageNum" v-model:page-size="pageSize" :total="total" />
      </div>
    </Panel>

    <BaseDialog :show="dialogOpen" :title="editingRow ? '编辑文档' : '新建文档'" width="extra-wide" @close="dialogOpen = false">
      <div class="grid gap-4 md:grid-cols-2">
        <Input :model-value="formText('title')" label="标题" required class="md:col-span-2" @update:model-value="setFormValue('title', $event)" />
        <label class="space-y-2"><span class="text-sm font-medium">分类</span><Select :model-value="formSelectValue('category')" :options="categoryOptions.filter((item) => item.value !== '')" @update:model-value="setFormValue('category', $event)" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">范围</span><Select :model-value="formSelectValue('scopeType')" :options="scopeOptions" @update:model-value="setFormValue('scopeType', $event)" /></label>
        <Input :model-value="formText('scopeValue')" label="范围值" placeholder="部门ID/角色ID，可为空" @update:model-value="setFormValue('scopeValue', $event)" />
        <Input :model-value="formText('attachmentUrl')" label="附件 URL" @update:model-value="setFormValue('attachmentUrl', $event)" />
        <TextArea :model-value="formText('summary')" label="摘要" class="md:col-span-2" @update:model-value="setFormValue('summary', $event)" />
        <TextArea :model-value="formText('content')" label="正文" required class="md:col-span-2" :rows="10" @update:model-value="setFormValue('content', $event)" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3"><Button variant="outline" @click="dialogOpen = false">取消</Button><Button :disabled="saving" @click="saveRow"><Save class="h-4 w-4" />保存</Button></div>
      </template>
    </BaseDialog>

    <BaseDialog :show="Boolean(detailRow)" :title="String(detailRow?.title || '文档详情')" width="extra-wide" @close="detailRow = null">
      <div v-if="detailRow" class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :label="String(detailRow.category || '未分类')" tone="cyan" />
          <StatusBadge :label="String(detailRow.status || 'PUBLISHED')" :tone="statusTone(detailRow.status)" />
        </div>
        <p class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">{{ detailRow.summary || '暂无摘要' }}</p>
        <div class="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">{{ excerpt(detailRow.content, 4000) }}</div>
      </div>
    </BaseDialog>

    <ConfirmDialog :show="Boolean(pendingDelete)" title="删除文档" :message="pendingDelete ? `确认删除“${pendingDelete.title}”？` : ''" confirm-text="删除" danger @cancel="pendingDelete = null" @confirm="confirmDelete" />
  </div>
</template>
