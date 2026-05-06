<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Edit3, KeyRound, Plus, RefreshCcw, RotateCcw, Save, Search, Settings2, Trash2 } from 'lucide-vue-next'
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
  type SysConfig,
  addConfig,
  deleteConfig,
  getConfigList,
  updateConfig
} from '@/services/api/system'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, getTotal, normalizeRows } from '@/pages/hr/hrUtils'

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const configs = ref<SysConfig[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const dialogOpen = ref(false)
const editingConfig = ref<SysConfig | null>(null)
const pendingDelete = ref<SysConfig | null>(null)

const filters = ref({
  configName: '',
  configKey: '',
  configType: ''
})

const query = ref({
  configName: '',
  configKey: '',
  configType: ''
})

const form = ref<SysConfig>({
  configName: '',
  configKey: '',
  configValue: '',
  configType: 'N',
  configScope: '1',
  remark: ''
})

const columns: Column<SysConfig>[] = [
  { key: 'configId', label: 'ID', sortable: true },
  { key: 'configName', label: '参数名称' },
  { key: 'configKey', label: '参数键名' },
  { key: 'configValue', label: '参数键值' },
  { key: 'configType', label: '类型' },
  { key: 'configScope', label: '作用域' },
  { key: 'createTime', label: '创建时间', sortable: true },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const typeOptions: SelectOption[] = [
  { value: '', label: '全部类型' },
  { value: 'Y', label: '内置' },
  { value: 'N', label: '自定义' }
]

const formTypeOptions: SelectOption[] = [
  { value: 'N', label: '自定义' },
  { value: 'Y', label: '内置' }
]

const scopeOptions: SelectOption[] = [
  { value: '1', label: '租户配置' },
  { value: '0', label: '全局配置' }
]

const summary = computed(() => ({
  total: total.value,
  builtin: configs.value.filter((item) => item.configType === 'Y').length,
  custom: configs.value.filter((item) => item.configType !== 'Y').length,
  tenant: configs.value.filter((item) => item.configScope !== '0').length
}))

const hasFilters = computed(() => Boolean(query.value.configName || query.value.configKey || query.value.configType))
const dialogTitle = computed(() => editingConfig.value ? '编辑参数' : '新增参数')

function typeLabel(type?: string) {
  return type === 'Y' ? '内置' : '自定义'
}

function scopeLabel(scope?: string) {
  return scope === '0' ? '全局' : '租户'
}

function formatDateTime(value?: string | null) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '-'
}

function resetForm(config?: SysConfig) {
  form.value = {
    configId: config?.configId,
    configName: config?.configName || '',
    configKey: config?.configKey || '',
    configValue: config?.configValue || '',
    configType: config?.configType || 'N',
    configScope: config?.configScope || '1',
    remark: config?.remark || ''
  }
}

async function fetchConfigs() {
  loading.value = true
  try {
    const page = await getConfigList({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      configName: query.value.configName || undefined,
      configKey: query.value.configKey || undefined,
      configType: query.value.configType || undefined
    })
    configs.value = normalizeRows<SysConfig>(page)
    total.value = getTotal<SysConfig>(page, configs.value.length)
  } catch (error) {
    configs.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '参数配置加载失败'))
  } finally {
    loading.value = false
  }
}

function searchConfigs() {
  query.value = {
    configName: filters.value.configName.trim(),
    configKey: filters.value.configKey.trim(),
    configType: filters.value.configType
  }
  pageNum.value = 1
  void fetchConfigs()
}

function resetFilters() {
  filters.value = { configName: '', configKey: '', configType: '' }
  query.value = { configName: '', configKey: '', configType: '' }
  pageNum.value = 1
  void fetchConfigs()
}

function openDialog(config?: SysConfig) {
  editingConfig.value = config || null
  resetForm(config)
  dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  editingConfig.value = null
  resetForm()
}

async function saveConfig() {
  if (!form.value.configName.trim()) {
    toast.error('请输入参数名称')
    return
  }
  if (!form.value.configKey.trim()) {
    toast.error('请输入参数键名')
    return
  }
  if (!form.value.configValue.trim()) {
    toast.error('请输入参数键值')
    return
  }

  saving.value = true
  try {
    const payload: SysConfig = {
      ...form.value,
      configName: form.value.configName.trim(),
      configKey: form.value.configKey.trim(),
      configValue: form.value.configValue.trim(),
      configType: form.value.configType || 'N',
      configScope: form.value.configScope || '1',
      remark: form.value.remark?.trim() || ''
    }
    if (editingConfig.value?.configId) await updateConfig({ ...payload, configId: editingConfig.value.configId })
    else await addConfig(payload)
    closeDialog()
    toast.success('保存成功')
    await fetchConfigs()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存参数失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value?.configId) return
  saving.value = true
  try {
    await deleteConfig([pendingDelete.value.configId])
    const nextPage = configs.value.length === 1 && pageNum.value > 1 ? pageNum.value - 1 : pageNum.value
    pendingDelete.value = null
    pageNum.value = nextPage
    toast.success('删除成功')
    await fetchConfigs()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除参数失败'))
  } finally {
    saving.value = false
  }
}

watch([pageNum, pageSize], () => {
  void fetchConfigs()
})

onMounted(() => {
  void fetchConfigs()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Settings2 class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          System Config
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">参数配置</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">维护系统运行参数，支持全局与租户维度配置</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchConfigs">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新
        </Button>
        <Button @click="openDialog()">
          <Plus class="h-4 w-4" />
          新增参数
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">参数总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">内置参数</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.builtin) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">自定义参数</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.custom) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">租户配置</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.tenant) }}</div></div>
    </div>

    <Panel title="筛选条件">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_auto]">
        <Input v-model="filters.configName" label="参数名称" placeholder="按名称模糊查询" @enter="searchConfigs" />
        <Input v-model="filters.configKey" label="参数键名" placeholder="例如 sys.user.initPassword" @enter="searchConfigs" />
        <label class="space-y-2">
          <span class="text-sm font-medium">参数类型</span>
          <Select v-model="filters.configType" :options="typeOptions" />
        </label>
        <div class="flex items-end gap-2">
          <Button @click="searchConfigs"><Search class="h-4 w-4" />查询</Button>
          <Button variant="outline" :disabled="!hasFilters" @click="resetFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel title="参数列表">
      <template #icon><KeyRound class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="columns" :data="configs" :loading="loading" row-key="configId">
        <template #cell-configId="{ row }"><span class="font-mono text-xs text-slate-500">#{{ row.configId }}</span></template>
        <template #cell-configName="{ row }">
          <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.configName }}</div>
          <div class="max-w-[260px] truncate text-xs text-slate-500">{{ row.remark || '-' }}</div>
        </template>
        <template #cell-configKey="{ row }">
          <code class="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">{{ row.configKey }}</code>
        </template>
        <template #cell-configValue="{ row }">
          <span class="block max-w-[280px] truncate text-sm text-slate-600 dark:text-slate-300" :title="row.configValue">{{ row.configValue }}</span>
        </template>
        <template #cell-configType="{ row }"><StatusBadge :label="typeLabel(row.configType)" :tone="row.configType === 'Y' ? 'yellow' : 'slate'" /></template>
        <template #cell-configScope="{ row }"><StatusBadge :label="scopeLabel(row.configScope)" :tone="row.configScope === '0' ? 'cyan' : 'green'" /></template>
        <template #cell-createTime="{ row }">{{ formatDateTime(row.createTime) }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openDialog(row)"><Edit3 class="h-4 w-4" /></Button>
            <Button v-if="row.configType !== 'Y'" size="icon" variant="ghost" @click="pendingDelete = row"><Trash2 class="h-4 w-4 text-red-500" /></Button>
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
        <Input v-model="form.configName" label="参数名称" required />
        <Input v-model="form.configKey" label="参数键名" required />
        <label class="space-y-2">
          <span class="text-sm font-medium">参数类型</span>
          <Select v-model="form.configType" :options="formTypeOptions" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">作用域</span>
          <Select v-model="form.configScope" :options="scopeOptions" />
        </label>
        <TextArea v-model="form.configValue" class="md:col-span-2" label="参数键值" :rows="4" required />
        <TextArea v-model="form.remark" class="md:col-span-2" label="备注" :rows="3" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeDialog">取消</Button>
          <Button :disabled="saving" @click="saveConfig"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(pendingDelete)"
      title="删除参数"
      :message="pendingDelete ? `确认删除参数“${pendingDelete.configName}”？删除后将无法恢复。` : ''"
      confirm-text="删除"
      danger
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
