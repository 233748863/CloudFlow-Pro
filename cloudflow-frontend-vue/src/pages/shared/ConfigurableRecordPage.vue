<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Database, Edit3, Plus, RefreshCcw, RotateCcw, Save, Search, Trash2 } from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Pagination,
  Panel,
  Select,
  StatCard,
  StatusBadge,
  TextArea,
  type Column
} from '@/components/common'
import {
  createRecord,
  deleteRecords,
  listPage,
  runRecordAction,
  updateRecord,
  type ApiRecord
} from '@/services/api/page'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  optionLabel,
  statusTone,
  type RecordActionConfig,
  type RecordFieldConfig,
  type RecordPageConfig
} from './recordPageConfig'

const props = defineProps<{
  config: RecordPageConfig
}>()

const toast = useToastStore()
const auth = useAuthStore()

const loading = ref(false)
const saving = ref(false)
const rows = ref<ApiRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = ref<ApiRecord>({})
const form = ref<ApiRecord>({})
const selectedIds = ref<Array<string | number>>([])
const dialogOpen = ref(false)
const editingRow = ref<ApiRecord | null>(null)
const pendingDelete = ref<ApiRecord | null>(null)
const pendingBatchDelete = ref(false)
const pendingAction = ref<{ action: RecordActionConfig; row: ApiRecord; message: string } | null>(null)

const tableFields = computed(() => props.config.fields.filter((field) => field.table !== false))
const filterFields = computed(() => props.config.fields.filter((field) => field.filter))
const formFields = computed(() => props.config.fields.filter((field) => !field.hiddenInForm && field.key !== props.config.idKey))
const canCreate = computed(() => !props.config.readOnly && Boolean(props.config.createPath))
const canUpdate = computed(() => !props.config.readOnly && Boolean(props.config.updatePath))
const canDelete = computed(() => !props.config.readOnly && Boolean(props.config.deletePath))
const hasFilters = computed(() => Object.values(filters.value).some((value) => String(value ?? '').trim()))

const getAvailableActions = (row: ApiRecord) => {
  return (props.config.actions || []).filter((action) => {
    if (action.permission && !auth.hasPermission(action.permission)) return false
    if (action.visible && !action.visible(row)) return false
    return true
  })
}

const columns = computed<Column<ApiRecord>[]>(() => [
  ...(canDelete.value ? [{ key: '__select', label: '', class: 'w-10 text-center' }] : []),
  { key: props.config.idKey, label: 'ID', sortable: true, class: 'w-24' },
  ...tableFields.value.map((field) => ({
    key: field.key,
    label: field.label,
    sortable: field.type !== 'textarea',
    class: field.widthClass
  })),
  { key: 'actions', label: '操作', class: 'text-right' }
])

const allPageSelected = computed(() => {
  const ids = rows.value.map(getRowId).filter((id): id is string | number => id != null)
  return ids.length > 0 && ids.every((id) => selectedIds.value.includes(id))
})

const summary = computed(() => {
  const statusField = props.config.fields.find((field) => field.status)
  const active = statusField
    ? rows.value.filter((row) => statusTone(row[statusField.key]) === 'green').length
    : rows.value.length
  const pending = statusField
    ? rows.value.filter((row) => statusTone(row[statusField.key]) === 'yellow').length
    : 0
  return {
    total: total.value,
    current: rows.value.length,
    active,
    pending
  }
})

const dialogTitle = computed(() => editingRow.value ? `编辑${props.config.title}` : `新增${props.config.title}`)

function formatNumber(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '0'
  return new Intl.NumberFormat('zh-CN').format(amount)
}

function getRowId(row: ApiRecord) {
  const id = row[props.config.idKey]
  return typeof id === 'string' || typeof id === 'number' ? id : undefined
}

function fieldByKey(key: string) {
  return props.config.fields.find((field) => field.key === key)
}

function toModelValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return value == null ? '' : String(value)
}

function toTextValue(value: unknown) {
  return value == null ? '' : String(value)
}

function toInputValue(value: unknown): string | number | null {
  if (typeof value === 'number') return value
  if (value == null) return ''
  return String(value)
}

function setFilterValue(key: string, value: string | number | boolean | null) {
  filters.value[key] = value
}

function setFormValue(key: string, value: string | number | boolean | null) {
  form.value[key] = value
}

function normalizeFieldValue(field: RecordFieldConfig, value: unknown) {
  if (value === '' || value === undefined) return undefined
  if (field.type === 'number') {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : undefined
  }
  if (field.type === 'datetime-local' && typeof value === 'string') {
    return value.replace('T', ' ').length === 16 ? `${value.replace('T', ' ')}:00` : value.replace('T', ' ')
  }
  return value
}

function getDefaultForm() {
  const next: ApiRecord = {}
  formFields.value.forEach((field) => {
    next[field.key] = field.defaultValue ?? ''
  })
  return next
}

function normalizeInputValue(field: RecordFieldConfig, value: unknown) {
  if (value == null) return field.defaultValue ?? ''
  const text = String(value)
  if (field.type === 'date') return text.slice(0, 10)
  if (field.type === 'datetime-local') return text.replace(' ', 'T').slice(0, 16)
  return value
}

function cleanPayload(source: ApiRecord) {
  const payload: ApiRecord = {}
  props.config.fields.forEach((field) => {
    const value = normalizeFieldValue(field, source[field.key])
    if (value !== undefined) payload[field.key] = value
  })
  const editingId = editingRow.value?.[props.config.idKey]
  if (editingId != null) payload[props.config.idKey] = editingId
  return payload
}

function getListParams() {
  const params: ApiRecord = {
    pageNum: page.value,
    pageSize: pageSize.value
  }
  filterFields.value.forEach((field) => {
    const value = normalizeFieldValue(field, filters.value[field.key])
    if (value !== undefined && String(value).trim()) params[field.key] = value
  })
  return params
}

async function fetchRows() {
  loading.value = true
  try {
    const data = await listPage(props.config.listPath, getListParams())
    rows.value = data.records
    total.value = data.total
    selectedIds.value = selectedIds.value.filter((id) => rows.value.some((row) => getRowId(row) === id))
  } catch (error) {
    rows.value = []
    total.value = 0
    toast.error(getErrorMessage(error, `${props.config.title}加载失败`))
  } finally {
    loading.value = false
  }
}

function searchRows() {
  page.value = 1
  void fetchRows()
}

function resetFilters() {
  filters.value = {}
  page.value = 1
  void fetchRows()
}

function openDialog(row?: ApiRecord) {
  editingRow.value = row || null
  const next = getDefaultForm()
  if (row) {
    formFields.value.forEach((field) => {
      next[field.key] = normalizeInputValue(field, row[field.key])
    })
  }
  form.value = next
  dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  editingRow.value = null
}

async function saveRow() {
  for (const field of formFields.value) {
    if (field.required && !String(form.value[field.key] ?? '').trim()) {
      toast.error(`请填写${field.label}`)
      return
    }
  }

  const payload = cleanPayload(form.value)
  const id = editingRow.value ? getRowId(editingRow.value) : undefined
  saving.value = true
  try {
    if (editingRow.value && props.config.updatePath) {
      await updateRecord(props.config.updatePath, payload, id, props.config.updateMode)
    } else if (props.config.createPath) {
      await createRecord(props.config.createPath, payload)
    }
    closeDialog()
    toast.success('保存成功')
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value || !props.config.deletePath) return
  const id = getRowId(pendingDelete.value)
  if (id == null) return
  saving.value = true
  try {
    await deleteRecords(props.config.deletePath, [id], props.config.deleteMode)
    pendingDelete.value = null
    selectedIds.value = selectedIds.value.filter((selectedId) => selectedId !== id)
    toast.success('删除成功')
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    saving.value = false
  }
}

async function confirmBatchDelete() {
  if (!props.config.deletePath || selectedIds.value.length === 0) return
  saving.value = true
  try {
    await deleteRecords(props.config.deletePath, selectedIds.value, props.config.deleteMode)
    pendingBatchDelete.value = false
    selectedIds.value = []
    toast.success('批量删除成功')
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, '批量删除失败'))
  } finally {
    saving.value = false
  }
}

function requestAction(action: RecordActionConfig, row: ApiRecord) {
  pendingAction.value = {
    action,
    row,
    message: action.confirm?.(row) || `确认执行“${action.label}”？`
  }
}

async function confirmAction() {
  if (!pendingAction.value) return
  const { action, row } = pendingAction.value
  saving.value = true
  try {
    await runRecordAction(action.path(row), action.method, action.payload?.(row))
    pendingAction.value = null
    toast.success(`${action.label}成功`)
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, `${action.label}失败`))
  } finally {
    saving.value = false
  }
}

function toggleSelect(row: ApiRecord, checked: boolean) {
  const id = getRowId(row)
  if (id == null) return
  selectedIds.value = checked
    ? Array.from(new Set([...selectedIds.value, id]))
    : selectedIds.value.filter((selectedId) => selectedId !== id)
}

function toggleSelectAll(checked: boolean) {
  const ids = rows.value.map(getRowId).filter((id): id is string | number => id != null)
  selectedIds.value = checked
    ? Array.from(new Set([...selectedIds.value, ...ids]))
    : selectedIds.value.filter((id) => !ids.includes(id))
}

function formatCell(field: RecordFieldConfig | undefined, value: unknown, row: ApiRecord) {
  if (!field) return String(value ?? '-')
  if (field.formatter) return field.formatter(value, row)
  if (field.type === 'select') return optionLabel(field.options, value)
  if (field.type === 'date') return value ? String(value).slice(0, 10) : '-'
  if (field.type === 'datetime-local') return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
  if (field.type === 'number' && value !== null && value !== undefined && value !== '') return formatNumber(value as number | string)
  return String(value ?? '-')
}

watch([() => page.value, () => pageSize.value], () => void fetchRows())
watch(
  () => props.config.path,
  () => {
    page.value = 1
    filters.value = {}
    selectedIds.value = []
    form.value = getDefaultForm()
    void fetchRows()
  }
)

onMounted(() => {
  form.value = getDefaultForm()
  void fetchRows()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <component :is="config.icon" class="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" />
          {{ config.eyebrow }}
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{{ config.title }}</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ config.description }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchRows">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新
        </Button>
        <Button v-if="canDelete && selectedIds.length > 0" variant="danger" :disabled="saving" @click="pendingBatchDelete = true">
          <Trash2 class="h-4 w-4" />
          删除选中
        </Button>
        <Button v-if="canCreate" @click="openDialog()">
          <Plus class="h-4 w-4" />
          新增
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <StatCard title="总数" :value="formatNumber(summary.total)" />
      <StatCard title="本页记录" :value="formatNumber(summary.current)" />
      <StatCard title="正常/完成" :value="formatNumber(summary.active)" />
      <StatCard title="待处理" :value="formatNumber(summary.pending)" />
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
        <template v-for="field in filterFields" :key="field.key">
          <label v-if="field.type === 'select'" class="space-y-2">
            <span class="text-sm font-medium">{{ field.label }}</span>
            <Select :model-value="toModelValue(filters[field.key])" :options="field.options || []" @update:model-value="setFilterValue(field.key, $event)" />
          </label>
          <Input
            v-else
            :model-value="toInputValue(filters[field.key])"
            :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'"
            :label="field.label"
            :placeholder="field.placeholder || config.searchPlaceholder"
            @update:model-value="setFilterValue(field.key, $event)"
            @enter="searchRows"
          />
        </template>
        <div class="flex items-end gap-2">
          <Button @click="searchRows"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel :title="`${config.title}列表`">
      <template #icon><Database class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="rows" :loading="loading" :row-key="config.idKey">
        <template #header-__select>
          <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" :checked="allPageSelected" @change="toggleSelectAll(($event.target as HTMLInputElement).checked)" />
        </template>
        <template v-for="column in columns" #[`cell-${column.key}`]="{ row, value }" :key="column.key">
          <template v-if="column.key === '__select'">
            <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" :checked="selectedIds.includes(getRowId(row) || '')" @change="toggleSelect(row, ($event.target as HTMLInputElement).checked)" />
          </template>
          <template v-else-if="column.key === config.idKey">
            <span class="font-mono text-xs text-slate-500">#{{ value }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <div class="flex flex-wrap justify-end gap-1">
              <Button
                v-for="action in getAvailableActions(row)"
                :key="action.label"
                size="sm"
                :variant="action.tone || 'ghost'"
                :disabled="action.disabled?.(row)"
                @click="requestAction(action, row)"
              >
                {{ action.label }}
              </Button>
              <Button v-if="canUpdate" size="icon" variant="ghost" @click="openDialog(row)">
                <Edit3 class="h-4 w-4" />
              </Button>
              <Button v-if="canDelete" size="icon" variant="ghost" @click="pendingDelete = row">
                <Trash2 class="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </template>
          <template v-else-if="fieldByKey(column.key)?.status">
            <StatusBadge :label="formatCell(fieldByKey(column.key), value, row)" :tone="statusTone(value)" />
          </template>
          <template v-else>
            <span :class="column.key === config.primaryKey ? 'font-semibold text-slate-900 dark:text-slate-100' : ''">
              {{ formatCell(fieldByKey(column.key), value, row) }}
            </span>
          </template>
        </template>
      </DataTable>
      <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </Panel>

    <BaseDialog :show="dialogOpen" :title="dialogTitle" width="wide" @close="closeDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <template v-for="field in formFields" :key="field.key">
          <label v-if="field.type === 'select'" class="space-y-2" :class="field.widthClass">
            <span class="text-sm font-medium">
              {{ field.label }}
              <span v-if="field.required" class="text-red-500">*</span>
            </span>
            <Select :model-value="toModelValue(form[field.key])" :options="(field.options || []).filter((item) => item.value !== '')" :disabled="field.readonly" @update:model-value="setFormValue(field.key, $event)" />
          </label>
          <TextArea
            v-else-if="field.type === 'textarea'"
            :model-value="toTextValue(form[field.key])"
            :label="field.label"
            :required="field.required"
            :readonly="field.readonly"
            :class="field.widthClass || 'md:col-span-2'"
            @update:model-value="setFormValue(field.key, $event)"
          />
          <Input
            v-else
            :model-value="toInputValue(form[field.key])"
            :type="field.type || 'text'"
            :label="field.label"
            :required="field.required"
            :readonly="field.readonly"
            :placeholder="field.placeholder"
            :class="field.widthClass"
            @update:model-value="setFormValue(field.key, $event)"
          />
        </template>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeDialog">取消</Button>
          <Button :disabled="saving" @click="saveRow"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(pendingDelete)"
      title="删除记录"
      :message="pendingDelete ? `确认删除“${pendingDelete[config.primaryKey] || pendingDelete[config.idKey]}”？` : ''"
      confirm-text="删除"
      danger
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />

    <ConfirmDialog
      :show="pendingBatchDelete"
      title="批量删除"
      :message="`确认删除选中的 ${selectedIds.length} 条记录？`"
      confirm-text="删除"
      danger
      @cancel="pendingBatchDelete = false"
      @confirm="confirmBatchDelete"
    />

    <ConfirmDialog
      :show="Boolean(pendingAction)"
      title="确认操作"
      :message="pendingAction?.message || ''"
      confirm-text="确认"
      @cancel="pendingAction = null"
      @confirm="confirmAction"
    />
  </div>
</template>
