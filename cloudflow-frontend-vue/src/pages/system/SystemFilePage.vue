<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Download, FileText, HardDrive, RefreshCcw, RotateCcw, Search, Trash2, Upload } from 'lucide-vue-next'
import { Button, ConfirmDialog, DataTable, Input, Pagination, Panel, Select, StatusBadge, type Column, type SelectOption } from '@/components/common'
import { type SysFile, type TenantStorageSummary, deleteFile, getFileList, getFileStorageSummary, refreshFileStorageSummary, uploadFile } from '@/services/api/systemManage'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, getTotal, normalizeRows } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const fileInput = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const uploading = ref(false)
const storageLoading = ref(false)
const files = ref<SysFile[]>([])
const storage = ref<TenantStorageSummary | null>(null)
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const pendingDelete = ref<SysFile | null>(null)
const filters = ref({ fileName: '', fileType: '' })
const query = ref({ ...filters.value })

const columns: Column<SysFile>[] = [
  { key: 'fileName', label: '文件名' },
  { key: 'fileSize', label: '大小', sortable: true },
  { key: 'fileType', label: '类型' },
  { key: 'storageType', label: '存储' },
  { key: 'createBy', label: '上传者' },
  { key: 'createTime', label: '上传时间', sortable: true },
  { key: 'actions', label: '操作', class: 'text-right' }
]
const typeOptions: SelectOption[] = [
  { value: '', label: '全部类型' },
  { value: 'jpg', label: '图片' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'Word' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'zip', label: '压缩包' }
]
const summary = computed(() => ({
  total: total.value,
  used: storage.value?.storageUsed || 0,
  limit: storage.value?.storageLimit || 0,
  percent: storage.value?.storageUsagePercent || 0
}))
const hasFilters = computed(() => Boolean(query.value.fileName || query.value.fileType))

function formatSize(size?: number) {
  const value = Number(size || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(2)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(2)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}
function formatStorage(mb?: number) {
  const value = Number(mb || 0)
  return value >= 1024 ? `${(value / 1024).toFixed(2)} GB` : `${formatNumber(value)} MB`
}
function normalizedType(type?: string) { return String(type || '').toLowerCase().replace(/^\./, '') }
function typeLabel(type?: string) {
  const value = normalizedType(type)
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(value)) return '图片'
  if (value === 'pdf') return 'PDF'
  if (['doc', 'docx'].includes(value)) return 'Word'
  if (['xls', 'xlsx', 'csv'].includes(value)) return 'Excel'
  if (['zip', 'rar', '7z'].includes(value)) return '压缩包'
  return value.toUpperCase() || '文件'
}
function formatDateTime(value?: string | null) { return value ? String(value).replace('T', ' ').slice(0, 16) : '-' }

async function fetchFiles() {
  loading.value = true
  try {
    const page = await getFileList({ pageNum: pageNum.value, pageSize: pageSize.value, fileName: query.value.fileName || undefined, fileType: query.value.fileType || undefined })
    files.value = normalizeRows<SysFile>(page)
    total.value = getTotal<SysFile>(page, files.value.length)
  } catch (error) {
    files.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '文件列表加载失败'))
  } finally {
    loading.value = false
  }
}
async function fetchStorage() {
  storageLoading.value = true
  try { storage.value = await getFileStorageSummary() } catch { storage.value = null } finally { storageLoading.value = false }
}
function searchFiles() { query.value = { fileName: filters.value.fileName.trim(), fileType: filters.value.fileType }; pageNum.value = 1; void fetchFiles() }
function resetFilters() { filters.value = { fileName: '', fileType: '' }; query.value = { ...filters.value }; pageNum.value = 1; void fetchFiles() }
async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    await uploadFile(file)
    toast.success('上传成功')
    await Promise.all([fetchFiles(), fetchStorage()])
  } catch (error) {
    toast.error(getErrorMessage(error, '上传失败'))
  } finally {
    uploading.value = false
    input.value = ''
  }
}
async function refreshStorage() {
  storageLoading.value = true
  try {
    storage.value = await refreshFileStorageSummary()
    toast.success('存储空间已校准')
  } catch (error) {
    toast.error(getErrorMessage(error, '校准存储失败'))
  } finally {
    storageLoading.value = false
  }
}
async function confirmDelete() {
  if (!pendingDelete.value?.fileId) return
  try {
    await deleteFile([pendingDelete.value.fileId])
    pendingDelete.value = null
    toast.success('删除成功')
    await Promise.all([fetchFiles(), fetchStorage()])
  } catch (error) {
    toast.error(getErrorMessage(error, '删除文件失败'))
  }
}
function openFile(url?: string) { if (url) window.open(url, '_blank', 'noopener,noreferrer') }

watch([pageNum, pageSize], () => void fetchFiles())
onMounted(() => void Promise.all([fetchFiles(), fetchStorage()]))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div><div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"><FileText class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />System File</div><h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">文件管理</h1><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">管理租户文件、上传记录和存储空间使用量</p></div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchFiles"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button variant="outline" :disabled="storageLoading" @click="refreshStorage"><HardDrive class="h-4 w-4" :class="storageLoading ? 'animate-spin' : ''" />校准空间</Button>
        <Button :disabled="uploading" @click="fileInput?.click()"><Upload class="h-4 w-4" />{{ uploading ? '上传中' : '上传文件' }}</Button>
        <input ref="fileInput" type="file" class="hidden" @change="onFileChange" />
      </div>
    </div>
    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">文件总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">已用空间</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatStorage(summary.used) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">空间上限</div><div class="mt-2 text-2xl font-semibold">{{ formatStorage(summary.limit) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">使用率</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ Number(summary.percent).toFixed(1) }}%</div></div>
    </div>
    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-[1fr_220px_auto]"><Input v-model="filters.fileName" label="文件名" placeholder="按文件名查询" @enter="searchFiles" /><label class="space-y-2"><span class="text-sm font-medium">文件类型</span><Select v-model="filters.fileType" :options="typeOptions" /></label><div class="flex items-end gap-2"><Button @click="searchFiles"><Search class="h-4 w-4" />查询</Button><Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button></div></div>
    </Panel>
    <Panel title="文件列表">
      <template #icon><FileText class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="files" :loading="loading" row-key="fileId">
        <template #cell-fileName="{ row }"><div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.fileName }}</div><div class="max-w-[320px] truncate text-xs text-slate-500" :title="row.filePath">{{ row.filePath || row.url || '-' }}</div></template>
        <template #cell-fileSize="{ row }">{{ formatSize(row.fileSize) }}</template>
        <template #cell-fileType="{ row }"><StatusBadge :label="typeLabel(row.fileType)" tone="slate" /></template>
        <template #cell-createTime="{ row }">{{ formatDateTime(row.createTime) }}</template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button size="icon" variant="ghost" :disabled="!row.url" @click="openFile(row.url)"><Download class="h-4 w-4" /></Button><Button size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button></div></template>
      </DataTable>
      <Pagination v-if="total > 0" v-model:page="pageNum" v-model:page-size="pageSize" :total="total" @update:page-size="pageNum = 1" />
    </Panel>
    <ConfirmDialog :show="Boolean(pendingDelete)" title="删除文件" :message="pendingDelete ? `确认删除文件“${pendingDelete.fileName}”？` : ''" confirm-text="删除" danger @cancel="pendingDelete = null" @confirm="confirmDelete" />
  </div>
</template>
