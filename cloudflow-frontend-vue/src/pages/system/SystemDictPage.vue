<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Edit3, Plus, RefreshCcw, RotateCcw, Save, Search, Tags, Trash2 } from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Panel,
  Select,
  StatusBadge,
  TextArea,
  type Column,
  type SelectOption
} from '@/components/common'
import {
  type SysDictData,
  type SysDictType,
  dictDataApi,
  dictTypeApi
} from '@/services/api/dict'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'

type DeleteTarget = { type: 'dictType'; item: SysDictType } | { type: 'dictData'; item: SysDictData } | null

const toast = useToastStore()
const typeLoading = ref(false)
const dataLoading = ref(false)
const saving = ref(false)
const dictTypes = ref<SysDictType[]>([])
const dictDataList = ref<SysDictData[]>([])
const selectedTypeId = ref<number | null>(null)
const typeDialogOpen = ref(false)
const dataDialogOpen = ref(false)
const editingType = ref<SysDictType | null>(null)
const editingData = ref<SysDictData | null>(null)
const deleteTarget = ref<DeleteTarget>(null)

const filters = ref({
  keyword: '',
  status: ''
})
const query = ref({ ...filters.value })

const typeForm = ref<SysDictType>({
  dictName: '',
  dictType: '',
  status: '0',
  remark: ''
})

const dataForm = ref<SysDictData>({
  dictType: '',
  dictLabel: '',
  dictValue: '',
  dictSort: 0,
  listClass: '',
  isDefault: 'N',
  status: '0',
  remark: ''
})

const dataColumns: Column<SysDictData>[] = [
  { key: 'dictSort', label: '排序', sortable: true },
  { key: 'dictLabel', label: '标签' },
  { key: 'dictValue', label: '键值' },
  { key: 'listClass', label: '样式' },
  { key: 'isDefault', label: '默认' },
  { key: 'status', label: '状态' },
  { key: 'remark', label: '备注' },
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

const listClassOptions: SelectOption[] = [
  { value: '', label: '默认' },
  { value: 'primary', label: '主要' },
  { value: 'success', label: '成功' },
  { value: 'warning', label: '警告' },
  { value: 'danger', label: '危险' },
  { value: 'info', label: '信息' }
]

const defaultOptions: SelectOption[] = [
  { value: 'N', label: '否' },
  { value: 'Y', label: '是' }
]

const selectedType = computed(() => dictTypes.value.find((item) => item.dictId === selectedTypeId.value) || null)
const filteredTypes = computed(() => dictTypes.value.filter((item) => {
  const keyword = query.value.keyword.trim()
  const matchesKeyword = !keyword || item.dictName.includes(keyword) || item.dictType.includes(keyword)
  const matchesStatus = !query.value.status || (item.status || '0') === query.value.status
  return matchesKeyword && matchesStatus
}))

const hasFilters = computed(() => Boolean(query.value.keyword || query.value.status))
const typeDialogTitle = computed(() => editingType.value ? '编辑字典类型' : '新增字典类型')
const dataDialogTitle = computed(() => editingData.value ? '编辑字典数据' : '新增字典数据')

const summary = computed(() => ({
  types: dictTypes.value.length,
  activeTypes: dictTypes.value.filter((item) => (item.status || '0') === '0').length,
  data: dictDataList.value.length,
  defaultData: dictDataList.value.filter((item) => item.isDefault === 'Y').length
}))

function statusLabel(status?: string) {
  return status === '1' ? '停用' : '正常'
}

function statusTone(status?: string) {
  return status === '1' ? 'red' : 'green'
}

function listClassLabel(value?: string) {
  const option = listClassOptions.find((item) => item.value === (value || ''))
  return option?.label || '默认'
}

function listClassTone(value?: string) {
  if (value === 'success') return 'green'
  if (value === 'warning') return 'yellow'
  if (value === 'danger') return 'red'
  if (value === 'primary' || value === 'info') return 'cyan'
  return 'slate'
}

function resetTypeForm(item?: SysDictType) {
  typeForm.value = {
    dictId: item?.dictId,
    dictName: item?.dictName || '',
    dictType: item?.dictType || '',
    status: item?.status || '0',
    remark: item?.remark || ''
  }
}

function resetDataForm(item?: SysDictData) {
  dataForm.value = {
    dictCode: item?.dictCode,
    dictType: item?.dictType || selectedType.value?.dictType || '',
    dictLabel: item?.dictLabel || '',
    dictValue: item?.dictValue || '',
    dictSort: Number(item?.dictSort || 0),
    listClass: item?.listClass || '',
    isDefault: item?.isDefault || 'N',
    status: item?.status || '0',
    remark: item?.remark || ''
  }
}

async function fetchTypes(preferredDictType?: string) {
  typeLoading.value = true
  try {
    const list = await dictTypeApi.list()
    dictTypes.value = Array.isArray(list) ? list : []
    const preferred = preferredDictType ? dictTypes.value.find((item) => item.dictType === preferredDictType) : null
    if (preferred?.dictId) selectedTypeId.value = preferred.dictId
    else if (!selectedTypeId.value || !dictTypes.value.some((item) => item.dictId === selectedTypeId.value)) selectedTypeId.value = dictTypes.value[0]?.dictId || null
  } catch (error) {
    dictTypes.value = []
    selectedTypeId.value = null
    dictDataList.value = []
    toast.error(getErrorMessage(error, '字典类型加载失败'))
  } finally {
    typeLoading.value = false
  }
}

async function fetchData(dictType?: string) {
  if (!dictType) {
    dictDataList.value = []
    return
  }
  dataLoading.value = true
  try {
    const list = await dictDataApi.list(dictType)
    dictDataList.value = Array.isArray(list) ? list : []
  } catch (error) {
    dictDataList.value = []
    toast.error(getErrorMessage(error, '字典数据加载失败'))
  } finally {
    dataLoading.value = false
  }
}

async function refreshAll() {
  const currentType = selectedType.value?.dictType
  await fetchTypes(currentType)
  await fetchData(currentType)
}

function searchTypes() {
  query.value = {
    keyword: filters.value.keyword.trim(),
    status: filters.value.status
  }
}

function resetFilters() {
  filters.value = { keyword: '', status: '' }
  query.value = { ...filters.value }
}

function openTypeDialog(item?: SysDictType) {
  editingType.value = item || null
  resetTypeForm(item)
  typeDialogOpen.value = true
}

function openDataDialog(item?: SysDictData) {
  if (!selectedType.value && !item) {
    toast.error('请先选择字典类型')
    return
  }
  editingData.value = item || null
  resetDataForm(item)
  dataDialogOpen.value = true
}

function closeTypeDialog() {
  typeDialogOpen.value = false
  editingType.value = null
  resetTypeForm()
}

function closeDataDialog() {
  dataDialogOpen.value = false
  editingData.value = null
  resetDataForm()
}

async function saveType() {
  if (!typeForm.value.dictName.trim()) {
    toast.error('请输入字典名称')
    return
  }
  if (!typeForm.value.dictType.trim()) {
    toast.error('请输入类型标识')
    return
  }
  saving.value = true
  try {
    const payload: SysDictType = {
      ...typeForm.value,
      dictName: typeForm.value.dictName.trim(),
      dictType: typeForm.value.dictType.trim(),
      status: typeForm.value.status || '0',
      remark: typeForm.value.remark?.trim() || ''
    }
    if (editingType.value?.dictId) await dictTypeApi.edit({ ...payload, dictId: editingType.value.dictId })
    else await dictTypeApi.add(payload)
    closeTypeDialog()
    toast.success('保存成功')
    await fetchTypes(payload.dictType)
  } catch (error) {
    toast.error(getErrorMessage(error, '保存字典类型失败'))
  } finally {
    saving.value = false
  }
}

async function saveData() {
  const dictType = editingData.value?.dictType || selectedType.value?.dictType
  if (!dictType) {
    toast.error('请先选择字典类型')
    return
  }
  if (!dataForm.value.dictLabel.trim()) {
    toast.error('请输入数据标签')
    return
  }
  if (!dataForm.value.dictValue.trim()) {
    toast.error('请输入数据键值')
    return
  }
  saving.value = true
  try {
    const payload: SysDictData = {
      ...dataForm.value,
      dictType,
      dictLabel: dataForm.value.dictLabel.trim(),
      dictValue: dataForm.value.dictValue.trim(),
      dictSort: Number(dataForm.value.dictSort || 0),
      listClass: dataForm.value.listClass || '',
      isDefault: dataForm.value.isDefault || 'N',
      status: dataForm.value.status || '0',
      remark: dataForm.value.remark?.trim() || ''
    }
    if (editingData.value?.dictCode) await dictDataApi.edit({ ...payload, dictCode: editingData.value.dictCode })
    else await dictDataApi.add(payload)
    closeDataDialog()
    toast.success('保存成功')
    await fetchData(dictType)
  } catch (error) {
    toast.error(getErrorMessage(error, '保存字典数据失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  saving.value = true
  try {
    if (target.type === 'dictType' && target.item.dictId) {
      await dictTypeApi.remove([target.item.dictId])
      toast.success('删除成功')
      deleteTarget.value = null
      await fetchTypes()
    } else if (target.type === 'dictData' && target.item.dictCode) {
      await dictDataApi.remove([target.item.dictCode])
      toast.success('删除成功')
      deleteTarget.value = null
      await fetchData(target.item.dictType)
    }
  } catch (error) {
    toast.error(getErrorMessage(error, '删除字典失败'))
  } finally {
    saving.value = false
  }
}

watch(selectedType, (next) => {
  void fetchData(next?.dictType)
})

watch(filteredTypes, (next) => {
  if (next.length === 0) {
    selectedTypeId.value = null
    return
  }
  if (!next.some((item) => item.dictId === selectedTypeId.value)) {
    selectedTypeId.value = next[0]?.dictId || null
  }
})

onMounted(() => {
  void fetchTypes()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Tags class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          System Dictionary
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">字典管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">维护系统枚举类型和字典数据，供表单、筛选与状态回显复用</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="typeLoading || dataLoading" @click="refreshAll">
          <RefreshCcw class="h-4 w-4" :class="typeLoading || dataLoading ? 'animate-spin' : ''" />
          刷新
        </Button>
        <Button variant="outline" @click="openTypeDialog()"><Plus class="h-4 w-4" />新增类型</Button>
        <Button :disabled="!selectedType" @click="openDataDialog()"><Plus class="h-4 w-4" />新增数据</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">字典类型</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.types) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">正常类型</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.activeTypes) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">当前数据</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.data) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">默认项</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.defaultData) }}</div></div>
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <Input v-model="filters.keyword" label="关键字" placeholder="搜索字典名称或类型标识" @enter="searchTypes" />
        <label class="space-y-2">
          <span class="text-sm font-medium">状态</span>
          <Select v-model="filters.status" :options="statusOptions" />
        </label>
        <div class="flex items-end gap-2">
          <Button @click="searchTypes"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <div class="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="字典类型">
        <template #icon><Tags class="h-4 w-4 text-slate-500" /></template>
        <div class="-m-4 max-h-[640px] overflow-y-auto">
          <div v-if="typeLoading" class="px-4 py-16 text-center text-sm text-slate-500">正在加载字典类型...</div>
          <div v-else-if="filteredTypes.length === 0" class="px-4 py-16 text-center text-sm text-slate-500">{{ hasFilters ? '当前筛选无结果' : '暂无字典类型' }}</div>
          <div v-else class="divide-y divide-slate-100 dark:divide-slate-800">
            <button
              v-for="item in filteredTypes"
              :key="item.dictId"
              class="group flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition"
              :class="item.dictId === selectedTypeId ? 'bg-cyan-50/70 dark:bg-cyan-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'"
              @click="selectedTypeId = item.dictId || null"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate font-semibold text-slate-900 dark:text-slate-100">{{ item.dictName }}</div>
                <div class="mt-1 truncate font-mono text-xs text-slate-500">{{ item.dictType }}</div>
                <div class="mt-2 flex items-center gap-2">
                  <StatusBadge :label="statusLabel(item.status)" :tone="statusTone(item.status)" />
                </div>
              </div>
              <div class="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                <Button size="icon" variant="ghost" @click.stop="openTypeDialog(item)"><Edit3 class="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" @click.stop="deleteTarget = { type: 'dictType', item }"><Trash2 class="h-4 w-4 text-red-500" /></Button>
              </div>
            </button>
          </div>
        </div>
      </Panel>

      <Panel :title="selectedType ? selectedType.dictName : '字典数据'">
        <template #icon><Tags class="h-4 w-4 text-slate-500" /></template>
        <template #actions>
          <div v-if="selectedType" class="font-mono text-xs text-slate-500">{{ selectedType.dictType }}</div>
        </template>
        <div v-if="!selectedType" class="py-20 text-center text-sm text-slate-500">请选择字典类型</div>
        <DataTable v-else :columns="dataColumns" :data="dictDataList" :loading="dataLoading" row-key="dictCode">
          <template #cell-dictSort="{ row }">{{ row.dictSort ?? 0 }}</template>
          <template #cell-dictLabel="{ row }">
            <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.dictLabel }}</div>
            <div class="text-xs text-slate-500">{{ row.createTime || '-' }}</div>
          </template>
          <template #cell-dictValue="{ row }"><span class="font-mono text-xs">{{ row.dictValue }}</span></template>
          <template #cell-listClass="{ row }"><StatusBadge :label="listClassLabel(row.listClass)" :tone="listClassTone(row.listClass)" /></template>
          <template #cell-isDefault="{ row }"><StatusBadge :label="row.isDefault === 'Y' ? '是' : '否'" :tone="row.isDefault === 'Y' ? 'cyan' : 'slate'" /></template>
          <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" /></template>
          <template #cell-remark="{ row }"><span class="block max-w-[220px] truncate" :title="row.remark">{{ row.remark || '-' }}</span></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="icon" variant="ghost" @click="openDataDialog(row)"><Edit3 class="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" @click="deleteTarget = { type: 'dictData', item: row }"><Trash2 class="h-4 w-4 text-red-500" /></Button>
            </div>
          </template>
        </DataTable>
      </Panel>
    </div>

    <BaseDialog :show="typeDialogOpen" :title="typeDialogTitle" width="wide" @close="closeTypeDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <Input v-model="typeForm.dictName" label="字典名称" required />
        <Input v-model="typeForm.dictType" label="类型标识" required />
        <label class="space-y-2 md:col-span-2">
          <span class="text-sm font-medium">状态</span>
          <Select v-model="typeForm.status" :options="formStatusOptions" />
        </label>
        <TextArea v-model="typeForm.remark" class="md:col-span-2" label="备注" :rows="4" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeTypeDialog">取消</Button>
          <Button :disabled="saving" @click="saveType"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <BaseDialog :show="dataDialogOpen" :title="dataDialogTitle" width="wide" @close="closeDataDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <Input v-model="dataForm.dictLabel" label="数据标签" required />
        <Input v-model="dataForm.dictValue" label="数据键值" required />
        <Input v-model="dataForm.dictSort" label="排序" type="number" />
        <label class="space-y-2">
          <span class="text-sm font-medium">样式</span>
          <Select v-model="dataForm.listClass" :options="listClassOptions" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">状态</span>
          <Select v-model="dataForm.status" :options="formStatusOptions" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">默认</span>
          <Select v-model="dataForm.isDefault" :options="defaultOptions" />
        </label>
        <TextArea v-model="dataForm.remark" class="md:col-span-2" label="备注" :rows="4" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeDataDialog">取消</Button>
          <Button :disabled="saving" @click="saveData"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(deleteTarget)"
      :title="deleteTarget?.type === 'dictType' ? '删除字典类型' : '删除字典数据'"
      :message="deleteTarget?.type === 'dictType' ? `确认删除字典类型“${deleteTarget.item.dictName}”？关联字典数据会一并删除。` : `确认删除字典数据“${deleteTarget?.item.dictLabel || ''}”？`"
      confirm-text="删除"
      danger
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
