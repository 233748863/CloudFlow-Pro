<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Edit3, Plus, RefreshCcw, RotateCcw, Save, Search, Trash2 } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, Input, Pagination, Panel, Select, StatCard, StatusBadge, TextArea, type Column } from '@/components/common'
import {
  createOaRecord,
  deleteOaRecords,
  getOaTotal,
  listOaPage,
  normalizeOaRows,
  updateOaRecord,
  type OaRecord
} from '@/services/api/oa'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  adminPageConfigByPath,
  optionLabel,
  statusLabel,
  statusTone,
  type AdminFieldConfig,
  type AdminPageConfig,
  type AdminRecord
} from '@/pages/admin/adminPageConfigs'
import { formatNumber } from '@/pages/hr/hrUtils'

const route = useRoute()
const toast = useToastStore()

const config = computed<AdminPageConfig>(() => {
  const matched = adminPageConfigByPath.get(route.path)
  if (matched) return matched
  return adminPageConfigByPath.get('/admin/asset') as AdminPageConfig
})

const loading = ref(false)
const saving = ref(false)
const rows = ref<AdminRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = ref<AdminRecord>({})
const form = ref<AdminRecord>({})
const dialogOpen = ref(false)
const editingRow = ref<AdminRecord | null>(null)
const pendingDelete = ref<AdminRecord | null>(null)
const pendingAction = ref<{ row: AdminRecord; label: string; run: () => Promise<void>; message: string } | null>(null)

const tableFields = computed(() => config.value.fields.filter((field) => field.table !== false))
const filterFields = computed(() => config.value.fields.filter((field) => field.filter))
const formFields = computed(() => config.value.fields.filter((field) => !field.hiddenInForm && field.key !== config.value.idKey))
const canWrite = computed(() => !config.value.readOnly)

const columns = computed<Column<AdminRecord>[]>(() => [
  { key: config.value.idKey, label: 'ID', sortable: true },
  ...tableFields.value.map((field) => ({ key: field.key, label: field.label, sortable: field.sortable })),
  { key: 'actions', label: '操作', class: 'text-right' }
])

const summary = computed(() => {
  const statusField = config.value.fields.find((field) => field.status)
  const activeCount = statusField
    ? rows.value.filter((row) => ['1', 'ACTIVE', 'AVAILABLE', 'CONFIRMED', 'ARRIVED', 'CHECKED_IN', 'APPROVED', 'BORROWED', 'RETURNED', 'COMPLETED', 'CLOSED'].includes(String(row[statusField.key] ?? '').toUpperCase())).length
    : rows.value.length
  const pendingCount = statusField
    ? rows.value.filter((row) => ['0', 'PENDING', 'SCHEDULED', 'DRAFT', 'OPEN', 'HANDLING'].includes(String(row[statusField.key] ?? '').toUpperCase())).length
    : 0
  return {
    total: total.value,
    current: rows.value.length,
    active: activeCount,
    pending: pendingCount
  }
})

const hasFilters = computed(() => Object.values(filters.value).some((value) => String(value ?? '').trim()))
const dialogTitle = computed(() => editingRow.value ? `编辑${config.value.title}` : `新增${config.value.title}`)

function cleanPayload(source: AdminRecord) {
  const payload: AdminRecord = {}
  config.value.fields.forEach((field) => {
    const value = source[field.key]
    if (value === '' || value === undefined) return
    payload[field.key] = normalizeFieldValue(field, value)
  })
  if (editingRow.value?.[config.value.idKey] != null) {
    payload[config.value.idKey] = editingRow.value[config.value.idKey]
  }
  return payload
}

function normalizeFieldValue(field: AdminFieldConfig, value: unknown): string | number | null | undefined {
  if (field.type === 'number') {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : undefined
  }
  if (field.type === 'datetime-local' && typeof value === 'string' && value) {
    return value.replace('T', ' ').length === 16 ? `${value.replace('T', ' ')}:00` : value.replace('T', ' ')
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return value as string | number | null | undefined
}

function getDefaultForm() {
  const next: AdminRecord = {}
  formFields.value.forEach((field) => {
    next[field.key] = field.defaultValue ?? ''
  })
  return next
}

function normalizeInputValue(field: AdminFieldConfig, value: unknown) {
  if (!value) return field.defaultValue ?? ''
  const text = String(value)
  if (field.type === 'date') return text.slice(0, 10)
  if (field.type === 'datetime-local') return text.replace(' ', 'T').slice(0, 16)
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return value as string | number | null | undefined
}

function updateFormValue(key: string, value: string) {
  form.value[key] = value
}

function isRowLocked(row: AdminRecord) {
  return Boolean(config.value.lockWhen?.(row))
}

function openDialog(row?: AdminRecord) {
  if (row && isRowLocked(row)) {
    toast.warning(config.value.lockMessage || '当前记录已锁定')
    return
  }
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

function getListParams() {
  const params: OaRecord = {
    pageNum: page.value,
    pageSize: pageSize.value
  }
  filterFields.value.forEach((field) => {
    const value = filters.value[field.key]
    if (String(value ?? '').trim()) params[field.key] = normalizeFieldValue(field, value)
  })
  return params
}

async function fetchRows() {
  loading.value = true
  try {
    const data = await listOaPage<AdminRecord>(config.value.basePath, getListParams())
    rows.value = normalizeOaRows(data).filter(Boolean)
    total.value = getOaTotal(data, rows.value.length)
  } catch (error) {
    rows.value = []
    total.value = 0
    toast.error(getErrorMessage(error, `${config.value.title}加载失败`))
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

async function saveRow() {
  for (const field of formFields.value) {
    if (field.required && !String(form.value[field.key] ?? '').trim()) {
      toast.error(`请填写${field.label}`)
      return
    }
  }

  saving.value = true
  try {
    const payload = cleanPayload(form.value)
    const path = editingRow.value ? (config.value.updatePath || config.value.basePath) : (config.value.createPath || config.value.basePath)
    if (editingRow.value) await updateOaRecord(path, payload)
    else await createOaRecord(path, payload)
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
  if (!pendingDelete.value) return
  const id = pendingDelete.value[config.value.idKey]
  if (id == null) return
  saving.value = true
  try {
    await deleteOaRecords(config.value.deletePath || config.value.basePath, [id])
    pendingDelete.value = null
    toast.success('删除成功')
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    saving.value = false
  }
}

async function runAction(action: { label: string; run: (row: AdminRecord) => Promise<void>; confirm?: (row: AdminRecord) => string }, row: AdminRecord) {
  if (action.confirm) {
    pendingAction.value = {
      row,
      label: action.label,
      run: () => action.run(row),
      message: action.confirm(row)
    }
    return
  }
  saving.value = true
  try {
    await action.run(row)
    toast.success(`${action.label}成功`)
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, `${action.label}失败`))
  } finally {
    saving.value = false
  }
}

async function confirmAction() {
  if (!pendingAction.value) return
  const action = pendingAction.value
  saving.value = true
  try {
    await action.run()
    pendingAction.value = null
    toast.success(`${action.label}成功`)
    await fetchRows()
  } catch (error) {
    toast.error(getErrorMessage(error, `${action.label}失败`))
  } finally {
    saving.value = false
  }
}

function formatCell(field: AdminFieldConfig | undefined, value: unknown, row: AdminRecord) {
  if (!field) return String(value ?? '-')
  if (field.formatter) return field.formatter(value, row)
  if (field.type === 'select') return optionLabel(field.options, value)
  if (field.type === 'date') return value ? String(value).slice(0, 10) : '-'
  if (field.type === 'datetime-local') return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
  return String(value ?? '-')
}

function fieldByKey(key: string) {
  return config.value.fields.find((field) => field.key === key)
}

watch([() => page.value, () => pageSize.value], () => void fetchRows())
watch(() => route.path, () => {
  filters.value = {}
  page.value = 1
  form.value = getDefaultForm()
  void fetchRows()
})

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
          <component :is="config.icon" class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
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
        <Button v-if="canWrite" @click="openDialog()">
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
            <Select v-model="filters[field.key]" :options="field.options || []" />
          </label>
          <Input v-else v-model="filters[field.key]" :type="field.type === 'number' ? 'number' : 'text'" :label="field.label" :placeholder="field.placeholder || config.searchPlaceholder" @enter="searchRows" />
        </template>
        <div class="flex items-end gap-2">
          <Button @click="searchRows"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel :title="`${config.title}列表`">
      <template #icon><component :is="config.icon" class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="rows" :loading="loading" :row-key="config.idKey">
        <template v-for="column in columns" #[`cell-${column.key}`]="{ row, value }" :key="column.key">
          <template v-if="column.key === config.idKey">
            <span class="font-mono text-xs text-slate-500">#{{ value }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <div class="flex flex-wrap justify-end gap-1">
              <Button v-for="action in (config.actions || []).filter((item) => !item.visible || item.visible(row))" :key="action.label" size="sm" :variant="action.tone || 'ghost'" @click="runAction(action, row)">
                {{ action.label }}
              </Button>
              <span v-if="isRowLocked(row)" class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                已锁定
              </span>
              <Button v-if="canWrite && !isRowLocked(row)" size="icon" variant="ghost" @click="openDialog(row)">
                <Edit3 class="h-4 w-4" />
              </Button>
              <Button v-if="canWrite && !isRowLocked(row) && config.deletePath !== ''" size="icon" variant="ghost" @click="pendingDelete = row">
                <Trash2 class="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </template>
          <template v-else-if="fieldByKey(column.key)?.status">
            <StatusBadge :label="statusLabel(value, fieldByKey(column.key)?.options)" :tone="statusTone(value)" />
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
            <Select v-model="form[field.key]" :options="(field.formOptions || field.options || []).filter((item) => item.value !== '')" />
          </label>
          <TextArea v-else-if="field.type === 'textarea'" :model-value="String(form[field.key] ?? '')" :label="field.label" :required="field.required" class="md:col-span-2" @update:model-value="updateFormValue(field.key, $event)" />
          <Input v-else v-model="form[field.key]" :type="field.type || 'text'" :label="field.label" :required="field.required" :placeholder="field.placeholder" :class="field.widthClass" />
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
      :show="Boolean(pendingAction)"
      title="确认操作"
      :message="pendingAction?.message || ''"
      confirm-text="确认"
      @cancel="pendingAction = null"
      @confirm="confirmAction"
    />
  </div>
</template>
