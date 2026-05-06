<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { CalendarDays, Clock3, Plus, RefreshCcw, Save, SlidersHorizontal, Umbrella, Users } from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
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
  type HrEmployee,
  type HrLeaveQuotaInitResult,
  type HrLeaveQuotaVO,
  type HrLeaveTypeOption,
  adjustHrLeaveQuota,
  createHrLeaveType,
  initHrLeaveQuota,
  listEmployees,
  listHrLeaveQuotaBuckets,
  listHrLeaveQuotas,
  listHrLeaveTypes,
  updateHrLeaveType
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { buildEmployeeLabel, formatDate, formatNumber, normalizeRows, statusTone, todayValue } from './hrUtils'

type DialogMode = 'type' | 'adjust' | null

const toast = useToastStore()
const loading = ref(false)
const bucketLoading = ref(false)
const submitting = ref(false)
const dialogMode = ref<DialogMode>(null)
const editingTypeId = ref<number | null>(null)
const employees = ref<HrEmployee[]>([])
const leaveTypes = ref<HrLeaveTypeOption[]>([])
const quotas = ref<HrLeaveQuotaVO[]>([])
const buckets = ref<HrLeaveQuotaVO[]>([])
const initResult = ref<HrLeaveQuotaInitResult | null>(null)
const selectedEmployeeId = ref<number | null>(null)
const selectedYear = ref(new Date().getFullYear())
const selectedLeaveTypeId = ref<number | null>(null)

const typeForm = ref({
  leaveCode: '',
  leaveName: '',
  needQuota: true,
  isPaid: true,
  unit: 'DAY',
  quotaRule: '',
  expiryRule: '',
  status: 1
})

const adjustForm = ref({
  adjustmentAmount: '',
  expiryDate: '',
  reason: ''
})

const quotaColumns: Column<HrLeaveQuotaVO>[] = [
  { key: 'leaveTypeName', label: '假种' },
  { key: 'totalQuota', label: '总额度' },
  { key: 'usedQuota', label: '已用' },
  { key: 'frozenQuota', label: '冻结' },
  { key: 'availableQuota', label: '可用' },
  { key: 'expiryDate', label: '过期日' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const bucketColumns: Column<HrLeaveQuotaVO>[] = [
  { key: 'year', label: '年度' },
  { key: 'totalQuota', label: '额度' },
  { key: 'usedQuota', label: '已用' },
  { key: 'availableQuota', label: '可用' },
  { key: 'expiryDate', label: '过期日' }
]

const typeColumns: Column<HrLeaveTypeOption>[] = [
  { key: 'leaveCode', label: '编码' },
  { key: 'leaveName', label: '名称' },
  { key: 'unit', label: '单位' },
  { key: 'needQuota', label: '需额度' },
  { key: 'isPaid', label: '带薪' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const unitOptions: SelectOption[] = [
  { value: 'DAY', label: '天' },
  { value: 'HOUR', label: '小时' }
]
const boolOptions: SelectOption[] = [
  { value: true, label: '是' },
  { value: false, label: '否' }
]
const statusOptions: SelectOption[] = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
]
const yearOptions = computed<SelectOption[]>(() => {
  const current = new Date().getFullYear()
  return [current - 1, current, current + 1].map((year) => ({ value: year, label: `${year}` }))
})
const employeeOptions = computed<SelectOption[]>(() =>
  employees.value.map((item) => ({ value: item.id, label: buildEmployeeLabel(item) }))
)
const leaveTypeOptions = computed<SelectOption[]>(() =>
  leaveTypes.value.filter((item) => item.needQuota !== false).map((item) => ({ value: item.id, label: item.leaveName }))
)
const selectedEmployee = computed(() => employees.value.find((item) => item.id === selectedEmployeeId.value) || null)
const selectedLeaveType = computed(() => leaveTypes.value.find((item) => item.id === selectedLeaveTypeId.value) || null)

const summary = computed(() => ({
  typeCount: leaveTypes.value.length,
  quotaCount: quotas.value.length,
  total: quotas.value.reduce((sum, item) => sum + Number(item.totalQuota || 0), 0),
  available: quotas.value.reduce((sum, item) => sum + Number(item.availableQuota || 0), 0)
}))

const quotaTone = (item: HrLeaveQuotaVO) => {
  if (Number(item.availableQuota || 0) <= 0) return 'red'
  if (item.expiryDate && item.expiryDate < todayValue()) return 'yellow'
  return 'green'
}

const loadOptions = async () => {
  const [employeeRes, typeRes] = await Promise.allSettled([listEmployees(), listHrLeaveTypes()])
  employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
  leaveTypes.value = typeRes.status === 'fulfilled' ? normalizeRows<HrLeaveTypeOption>(typeRes.value) : []
  selectedEmployeeId.value ||= employees.value[0]?.id || null
  selectedLeaveTypeId.value ||= leaveTypeOptions.value[0]?.value as number || null
}

const loadQuotas = async () => {
  if (!selectedEmployeeId.value) return
  loading.value = true
  try {
    quotas.value = normalizeRows<HrLeaveQuotaVO>(await listHrLeaveQuotas({
      employeeId: selectedEmployeeId.value,
      year: Number(selectedYear.value)
    }))
    selectedLeaveTypeId.value ||= quotas.value[0]?.leaveTypeId || leaveTypeOptions.value[0]?.value as number || null
    await loadBuckets()
  } catch (error) {
    toast.error(getErrorMessage(error, '假期额度加载失败'))
  } finally {
    loading.value = false
  }
}

const loadBuckets = async () => {
  if (!selectedEmployeeId.value || !selectedLeaveTypeId.value) {
    buckets.value = []
    return
  }
  bucketLoading.value = true
  try {
    buckets.value = normalizeRows<HrLeaveQuotaVO>(await listHrLeaveQuotaBuckets({
      employeeId: selectedEmployeeId.value,
      leaveTypeId: selectedLeaveTypeId.value,
      year: Number(selectedYear.value)
    }))
  } catch {
    buckets.value = []
  } finally {
    bucketLoading.value = false
  }
}

const openTypeDialog = (item?: HrLeaveTypeOption) => {
  editingTypeId.value = item?.id || null
  typeForm.value = {
    leaveCode: item?.leaveCode || '',
    leaveName: item?.leaveName || '',
    needQuota: item?.needQuota ?? true,
    isPaid: item?.isPaid ?? true,
    unit: item?.unit || 'DAY',
    quotaRule: item?.quotaRule || '',
    expiryRule: item?.expiryRule || '',
    status: item?.status ?? 1
  }
  dialogMode.value = 'type'
}

const openAdjustDialog = (item?: HrLeaveQuotaVO) => {
  selectedLeaveTypeId.value = item?.leaveTypeId || selectedLeaveTypeId.value
  adjustForm.value = {
    adjustmentAmount: '',
    expiryDate: formatDate(item?.expiryDate, ''),
    reason: ''
  }
  dialogMode.value = 'adjust'
}

const handleSave = async () => {
  submitting.value = true
  try {
    if (dialogMode.value === 'type') {
      const payload = {
        leaveCode: typeForm.value.leaveCode,
        leaveName: typeForm.value.leaveName,
        needQuota: typeForm.value.needQuota,
        isPaid: typeForm.value.isPaid,
        unit: typeForm.value.unit,
        quotaRule: typeForm.value.quotaRule,
        expiryRule: typeForm.value.expiryRule,
        status: typeForm.value.status
      }
      if (editingTypeId.value) await updateHrLeaveType(editingTypeId.value, payload)
      else await createHrLeaveType(payload)
      await loadOptions()
    } else if (dialogMode.value === 'adjust') {
      if (!selectedEmployeeId.value || !selectedLeaveTypeId.value) throw new Error('请选择员工和假种')
      await adjustHrLeaveQuota({
        employeeId: selectedEmployeeId.value,
        leaveTypeId: selectedLeaveTypeId.value,
        year: Number(selectedYear.value),
        adjustmentAmount: Number(adjustForm.value.adjustmentAmount || 0),
        expiryDate: adjustForm.value.expiryDate || undefined,
        reason: adjustForm.value.reason
      })
      await loadQuotas()
    }
    dialogMode.value = null
    toast.success('保存成功')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    submitting.value = false
  }
}

const runInitQuota = async (all = false) => {
  if (!selectedEmployeeId.value) return
  submitting.value = true
  try {
    initResult.value = await initHrLeaveQuota({
      employeeId: selectedEmployeeId.value,
      year: Number(selectedYear.value),
      leaveTypeId: all ? undefined : selectedLeaveTypeId.value || undefined
    })
    toast.success('年度额度处理完成')
    await loadQuotas()
  } catch (error) {
    toast.error(getErrorMessage(error, '初始化额度失败'))
  } finally {
    submitting.value = false
  }
}

watch([selectedEmployeeId, selectedYear], () => {
  void loadQuotas()
})

watch(selectedLeaveTypeId, () => {
  void loadBuckets()
})

onMounted(async () => {
  await loadOptions()
  await loadQuotas()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Umbrella class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Leave Quota
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">假期额度</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="loadQuotas"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="openTypeDialog()"><Plus class="h-4 w-4" />新建假种</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">假种</div><div class="mt-2 text-2xl font-semibold">{{ summary.typeCount }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">额度记录</div><div class="mt-2 text-2xl font-semibold">{{ summary.quotaCount }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">年度总额</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.total) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">可用额度</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.available) }}</div></div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="员工与年度">
        <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
        <div class="space-y-3">
          <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="selectedEmployeeId" :options="employeeOptions" searchable /></label>
          <label class="space-y-2"><span class="text-sm font-medium">年度</span><Select v-model="selectedYear" :options="yearOptions" /></label>
          <label class="space-y-2"><span class="text-sm font-medium">假种</span><Select v-model="selectedLeaveTypeId" :options="leaveTypeOptions" searchable /></label>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
            <div class="font-semibold text-slate-900 dark:text-slate-100">{{ selectedEmployee ? buildEmployeeLabel(selectedEmployee) : '未选择员工' }}</div>
            <div class="mt-1 text-xs text-slate-500">{{ selectedLeaveType?.leaveName || '未选择假种' }} · {{ selectedYear }}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" @click="runInitQuota(false)">补齐当前假种</Button>
            <Button size="sm" @click="runInitQuota(true)">补齐全部</Button>
            <Button size="sm" variant="outline" @click="openAdjustDialog()">调整额度</Button>
          </div>
        </div>
      </Panel>

      <Panel title="年度额度">
        <template #icon><CalendarDays class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="quotaColumns" :data="quotas" :loading="loading" row-key="id">
          <template #cell-leaveTypeName="{ row }">
            <button type="button" class="text-left" @click="selectedLeaveTypeId = row.leaveTypeId">
              <div class="font-semibold">{{ row.leaveTypeName || row.leaveTypeId }}</div>
              <div class="text-xs text-slate-500">{{ row.employeeName || '-' }}</div>
            </button>
          </template>
          <template #cell-totalQuota="{ row }">{{ formatNumber(row.totalQuota) }}</template>
          <template #cell-usedQuota="{ row }">{{ formatNumber(row.usedQuota) }}</template>
          <template #cell-frozenQuota="{ row }">{{ formatNumber(row.frozenQuota) }}</template>
          <template #cell-availableQuota="{ row }"><StatusBadge :label="formatNumber(row.availableQuota)" :tone="quotaTone(row)" /></template>
          <template #cell-expiryDate="{ row }">{{ formatDate(row.expiryDate, '长期有效') }}</template>
          <template #cell-actions="{ row }"><div class="flex justify-end"><Button size="sm" @click="openAdjustDialog(row)">调整</Button></div></template>
        </DataTable>
      </Panel>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <Panel title="额度桶">
        <template #icon><Clock3 class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="bucketColumns" :data="buckets" :loading="bucketLoading" row-key="id">
          <template #cell-totalQuota="{ row }">{{ formatNumber(row.totalQuota) }}</template>
          <template #cell-usedQuota="{ row }">{{ formatNumber(row.usedQuota) }}</template>
          <template #cell-availableQuota="{ row }">{{ formatNumber(row.availableQuota) }}</template>
          <template #cell-expiryDate="{ row }">{{ formatDate(row.expiryDate, '长期有效') }}</template>
        </DataTable>
      </Panel>

      <Panel title="假种配置">
        <template #icon><SlidersHorizontal class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="typeColumns" :data="leaveTypes" :loading="loading" row-key="id">
          <template #cell-unit="{ row }">{{ row.unit === 'HOUR' ? '小时' : '天' }}</template>
          <template #cell-needQuota="{ row }"><StatusBadge :label="row.needQuota ? '是' : '否'" :tone="row.needQuota ? 'cyan' : 'slate'" /></template>
          <template #cell-isPaid="{ row }"><StatusBadge :label="row.isPaid ? '是' : '否'" :tone="row.isPaid ? 'green' : 'yellow'" /></template>
          <template #cell-status="{ row }"><StatusBadge :label="row.status === 0 ? '停用' : '启用'" :tone="statusTone(row.status ?? 1)" /></template>
          <template #cell-actions="{ row }"><div class="flex justify-end"><Button size="sm" variant="outline" @click="openTypeDialog(row)">编辑</Button></div></template>
        </DataTable>
      </Panel>
    </div>

    <Panel v-if="initResult" title="最近初始化结果">
      <template #icon><Save class="h-4 w-4 text-slate-500" /></template>
      <div class="mb-3 grid gap-3 md:grid-cols-4">
        <div class="card p-3"><div class="text-xs text-slate-500">新建</div><div class="mt-1 text-lg font-semibold">{{ initResult.createdCount }}</div></div>
        <div class="card p-3"><div class="text-xs text-slate-500">刷新</div><div class="mt-1 text-lg font-semibold">{{ initResult.refreshedCount }}</div></div>
        <div class="card p-3"><div class="text-xs text-slate-500">跳过</div><div class="mt-1 text-lg font-semibold">{{ initResult.skippedCount }}</div></div>
        <div class="card p-3"><div class="text-xs text-slate-500">处理数</div><div class="mt-1 text-lg font-semibold">{{ initResult.requestedCount }}</div></div>
      </div>
      <div class="space-y-2">
        <div v-for="item in initResult.items" :key="`${item.leaveTypeId}-${item.action}`" class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
          <span class="font-semibold">{{ item.leaveTypeName || item.leaveTypeId }}</span>
          <span class="ml-2 text-slate-500">{{ item.action }} · {{ item.message || formatNumber(item.totalQuota) }}</span>
        </div>
      </div>
    </Panel>

    <BaseDialog :show="Boolean(dialogMode)" title="假期额度操作" width="wide" @close="dialogMode = null">
      <div v-if="dialogMode === 'type'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="typeForm.leaveCode" label="假种编码" :disabled="Boolean(editingTypeId)" required />
        <Input v-model="typeForm.leaveName" label="假种名称" required />
        <label class="space-y-2"><span class="text-sm font-medium">单位</span><Select v-model="typeForm.unit" :options="unitOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">需要额度</span><Select v-model="typeForm.needQuota" :options="boolOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">带薪</span><Select v-model="typeForm.isPaid" :options="boolOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="typeForm.status" :options="statusOptions" /></label>
        <TextArea v-model="typeForm.quotaRule" label="额度规则 JSON" />
        <TextArea v-model="typeForm.expiryRule" label="过期规则 JSON" />
      </div>
      <div v-else-if="dialogMode === 'adjust'" class="grid gap-4 md:grid-cols-2">
        <Input :model-value="selectedEmployee ? buildEmployeeLabel(selectedEmployee) : ''" label="员工" disabled />
        <Input :model-value="selectedLeaveType?.leaveName || ''" label="假种" disabled />
        <Input v-model="adjustForm.adjustmentAmount" label="调整额度" type="number" required />
        <Input v-model="adjustForm.expiryDate" label="过期日期" type="date" />
        <TextArea v-model="adjustForm.reason" label="调整原因" class="md:col-span-2" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="dialogMode = null">取消</Button>
          <Button :disabled="submitting" @click="handleSave"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>
