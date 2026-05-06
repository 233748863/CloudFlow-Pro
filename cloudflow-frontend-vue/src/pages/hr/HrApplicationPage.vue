<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Trash2,
  Umbrella,
  XCircle
} from 'lucide-vue-next'
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
  type HrEmployee,
  type HrLeaveApplicationPayload,
  type HrLeaveApplicationVO,
  type HrLeaveTypeOption,
  type HrOvertimeApplicationPayload,
  type HrOvertimeApplicationVO,
  type HrOvertimeStatisticsVO,
  approveHrLeaveApplication,
  approveHrOvertimeApplication,
  cancelHrLeaveApplication,
  cancelHrOvertimeApplication,
  createHrLeaveApplication,
  createHrOvertimeApplication,
  deleteHrOvertimeApplication,
  getHrLeaveApplication,
  getHrOvertimeApplication,
  getHrOvertimeStatistics,
  getHrSelfServiceRestrictionMessage,
  listEmployees,
  listHrLeaveApplications,
  listHrLeaveQuotas,
  listHrLeaveTypes,
  listHrOvertimeApplications,
  rejectHrLeaveApplication,
  rejectHrOvertimeApplication,
  resolveCurrentEmployee,
  submitHrLeaveApplication,
  submitHrOvertimeApplication,
  updateHrOvertimeApplication
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { buildEmployeeLabel, formatNumber, normalizeRows, statusTone, todayValue, workflowStatusLabel } from './hrUtils'

type ModuleKey = 'leave' | 'overtime'
type ApplicationRecord = HrLeaveApplicationVO | HrOvertimeApplicationVO
type ConfirmState = {
  type: 'submit' | 'approve' | 'reject' | 'cancel' | 'delete'
  id: number
  title: string
  message: string
  confirmText: string
  danger?: boolean
}

const route = useRoute()
const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const detailLoading = ref(false)
const employees = ref<HrEmployee[]>([])
const employee = ref<HrEmployee | null>(null)
const leaveTypes = ref<HrLeaveTypeOption[]>([])
const records = ref<ApplicationRecord[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const statusFilter = ref('')
const typeFilter = ref('')
const startDateFrom = ref('')
const startDateTo = ref('')
const showForm = ref(false)
const showDetail = ref(false)
const selected = ref<ApplicationRecord | null>(null)
const current = ref<ApplicationRecord | null>(null)
const confirmState = ref<ConfirmState | null>(null)
const overtimeStats = ref<HrOvertimeStatisticsVO | null>(null)

const moduleKey = computed<ModuleKey>(() => route.path.includes('/overtime') ? 'overtime' : 'leave')
const isLeave = computed(() => moduleKey.value === 'leave')
const moduleConfig = computed(() => isLeave.value
  ? {
      title: '请假申请',
      eyebrow: 'Leave Application',
      icon: Umbrella,
      primary: '新建请假',
      empty: '暂无请假申请'
    }
  : {
      title: '加班申请',
      eyebrow: 'Overtime Application',
      icon: CalendarClock,
      primary: '新建加班',
      empty: '暂无加班申请'
    })

const leaveForm = ref({
  leaveTypeId: '',
  startTime: '',
  endTime: '',
  duration: '1',
  unit: 'DAY',
  reason: ''
})

const overtimeForm = ref({
  startTime: '',
  endTime: '',
  overtimeType: 'WORKDAY',
  compensationType: 'TIME_OFF',
  reason: ''
})

const columns = computed<Column<ApplicationRecord>[]>(() => {
  if (isLeave.value) {
    return [
      { key: 'applicationNo', label: '申请编号' },
      { key: 'employeeName', label: '员工' },
      { key: 'leaveTypeName', label: '假种' },
      { key: 'startTime', label: '时间范围' },
      { key: 'duration', label: '时长' },
      { key: 'status', label: '状态' },
      { key: 'actions', label: '操作', class: 'text-right' }
    ]
  }
  return [
    { key: 'applicationNo', label: '申请编号' },
    { key: 'employeeName', label: '员工' },
    { key: 'overtimeType', label: '类型' },
    { key: 'startTime', label: '时间范围' },
    { key: 'duration', label: '时长' },
    { key: 'status', label: '状态' },
    { key: 'actions', label: '操作', class: 'text-right' }
  ]
})

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'APPROVING', label: '审批中' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'CANCELLED', label: '已撤销' }
]

const unitOptions: SelectOption[] = [
  { value: 'DAY', label: '天' },
  { value: 'HOUR', label: '小时' }
]

const overtimeTypeOptions: SelectOption[] = [
  { value: 'WORKDAY', label: '工作日' },
  { value: 'WEEKEND', label: '周末' },
  { value: 'HOLIDAY', label: '节假日' }
]

const compensationTypeOptions: SelectOption[] = [
  { value: 'TIME_OFF', label: '调休' },
  { value: 'PAYMENT', label: '加班费' }
]

const leaveTypeOptions = computed<SelectOption[]>(() =>
  leaveTypes.value.map((item) => ({ value: item.id, label: item.leaveName }))
)

const typeOptions = computed<SelectOption[]>(() => isLeave.value
  ? [{ value: '', label: '全部假种' }, ...leaveTypeOptions.value]
  : [{ value: '', label: '全部类型' }, ...overtimeTypeOptions])

const selfServiceRestriction = computed(() => getHrSelfServiceRestrictionMessage(employee.value))
const selfServiceLocked = computed(() => loading.value || saving.value || Boolean(selfServiceRestriction.value))
const selectedId = computed(() => selected.value?.id || null)

const summary = computed(() => ({
  total: total.value || records.value.length,
  draft: records.value.filter((item) => String(item.status || '').toUpperCase() === 'DRAFT').length,
  approving: records.value.filter((item) => String(item.status || '').toUpperCase() === 'APPROVING').length,
  approved: records.value.filter((item) => String(item.status || '').toUpperCase() === 'APPROVED').length
}))

const detailStats = computed(() => {
  if (!selected.value) return []
  if (isLeave.value) {
    const item = selected.value as HrLeaveApplicationVO
    return [
      { label: '假种', value: item.leaveTypeName || item.leaveTypeId || '-' },
      { label: '时长', value: `${formatNumber(item.duration)}${unitLabel(item.unit)}` },
      { label: '流程', value: item.processInstanceId || '-' }
    ]
  }
  const item = selected.value as HrOvertimeApplicationVO
  return [
    { label: '补偿', value: item.compensationTypeName || compensationTypeLabel(item.compensationType) },
    { label: '补偿时长', value: `${formatNumber(item.compensationHours)}小时` },
    { label: '流程', value: item.processInstanceId || '-' }
  ]
})

const selectedQuotas = ref<Array<{ id: number; leaveTypeName?: string; availableQuota?: number; totalQuota?: number; frozenQuota?: number }>>([])

const statusLabel = (item: ApplicationRecord): string => {
  const status = String(item.status || '')
  const overtime = item as Partial<HrOvertimeApplicationVO>
  return String(overtime.statusName || workflowStatusLabel[status] || status || '-')
}

const unitLabel = (value?: string) => value === 'HOUR' ? '小时' : '天'
const overtimeTypeLabel = (value?: string) =>
  overtimeTypeOptions.find((item) => item.value === value)?.label || value || '-'
const compensationTypeLabel = (value?: string) =>
  compensationTypeOptions.find((item) => item.value === value)?.label || value || '-'
const formatDateTime = (value?: string | null) => value ? String(value).replace('T', ' ').slice(0, 16) : '-'
const statusValue = (item?: ApplicationRecord | null) => String(item?.status || '').toUpperCase()
const recordNo = (item: ApplicationRecord) => String(item.applicationNo || item.id || '-')
const recordEmployeeName = (item: ApplicationRecord) => item.employeeName || employee.value?.name || '-'
const recordEmployeeNo = (item: ApplicationRecord) => 'employeeNo' in item ? item.employeeNo || '-' : employee.value?.employeeNo || '-'
const recordLeaveTypeLabel = (item: ApplicationRecord) => 'leaveTypeName' in item ? String(item.leaveTypeName || item.leaveTypeId || '-') : '-'
const recordOvertimeTypeLabel = (item: ApplicationRecord) => {
  if (!('overtimeTypeName' in item)) return '-'
  const overtime = item as HrOvertimeApplicationVO
  return overtime.overtimeTypeName || overtimeTypeLabel(overtime.overtimeType)
}
const recordDurationLabel = (item: ApplicationRecord) =>
  `${formatNumber(item.duration)}${'unit' in item ? unitLabel((item as HrLeaveApplicationVO).unit) : '小时'}`
const recordReason = (item?: ApplicationRecord | null) => String(item?.reason || '')
const recordStatusTone = (item?: ApplicationRecord | null) => statusTone(String(item?.status || ''))
const canSubmit = (item?: ApplicationRecord | null) => statusValue(item) === 'DRAFT'
const canApprove = (item?: ApplicationRecord | null) => statusValue(item) === 'APPROVING'
const canCancel = (item?: ApplicationRecord | null) => ['APPROVING', 'APPROVED'].includes(statusValue(item))
const canEditOvertime = (item?: ApplicationRecord | null) => !isLeave.value && ['DRAFT', 'REJECTED'].includes(statusValue(item))

const toApiDateTime = (value: string) => {
  if (!value) return ''
  const normalized = value.replace('T', ' ')
  return normalized.length === 16 ? `${normalized}:00` : normalized
}

const toInputDateTime = (value?: string | null) => {
  if (!value) return ''
  return String(value).replace(' ', 'T').slice(0, 16)
}

const buildStartTimeFrom = () => startDateFrom.value ? `${startDateFrom.value} 00:00:00` : undefined
const buildStartTimeTo = () => startDateTo.value ? `${startDateTo.value} 23:59:59` : undefined

const loadOptions = async () => {
  const [employeeRes, leaveTypeRes] = await Promise.allSettled([
    listEmployees({ pageNum: 1, pageSize: 500 }),
    listHrLeaveTypes()
  ])
  employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
  leaveTypes.value = leaveTypeRes.status === 'fulfilled' ? normalizeRows<HrLeaveTypeOption>(leaveTypeRes.value) : []
  try {
    employee.value = await resolveCurrentEmployee()
  } catch {
    employee.value = employees.value[0] || null
  }
  leaveForm.value.leaveTypeId = String(leaveTypeOptions.value[0]?.value || '')
}

const loadLeaveApplications = async () => {
  const page = await listHrLeaveApplications({
    employeeId: employee.value?.id,
    leaveTypeId: typeFilter.value ? Number(typeFilter.value) : undefined,
    status: statusFilter.value || undefined,
    startTimeFrom: buildStartTimeFrom(),
    startTimeTo: buildStartTimeTo(),
    pageNum: pageNum.value,
    pageSize: pageSize.value
  })
  records.value = normalizeRows<ApplicationRecord>(page)
  total.value = Number(page.total || records.value.length)
}

const loadOvertimeApplications = async () => {
  const list = await listHrOvertimeApplications({
    employeeId: employee.value?.id,
    overtimeType: typeFilter.value || undefined,
    status: statusFilter.value || undefined,
    startTimeFrom: buildStartTimeFrom(),
    startTimeTo: buildStartTimeTo(),
    pageNum: pageNum.value,
    pageSize: pageSize.value
  })
  const allRows = normalizeRows<ApplicationRecord>(list)
  const start = (pageNum.value - 1) * pageSize.value
  records.value = allRows.slice(start, start + pageSize.value)
  total.value = allRows.length
}

const loadSupportingData = async () => {
  if (!employee.value?.id) return
  if (isLeave.value) {
    try {
      selectedQuotas.value = normalizeRows(await listHrLeaveQuotas({ employeeId: employee.value.id, year: new Date().getFullYear() }))
    } catch {
      selectedQuotas.value = []
    }
    return
  }
  try {
    overtimeStats.value = await getHrOvertimeStatistics(employee.value.id, todayValue().slice(0, 7))
  } catch {
    overtimeStats.value = null
  }
}

const fetchList = async (preserveId?: number) => {
  loading.value = true
  try {
    if (!employee.value) await loadOptions()
    if (isLeave.value) await loadLeaveApplications()
    else await loadOvertimeApplications()
    await loadSupportingData()
    const nextId = preserveId || selectedId.value || records.value[0]?.id
    selected.value = records.value.find((item) => item.id === nextId) || records.value[0] || null
  } catch (error) {
    toast.error(getErrorMessage(error, '申请列表加载失败'))
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  statusFilter.value = ''
  typeFilter.value = ''
  startDateFrom.value = ''
  startDateTo.value = ''
  pageNum.value = 1
  void fetchList()
}

const openAdd = () => {
  if (selfServiceRestriction.value) {
    toast.error(selfServiceRestriction.value)
    return
  }
  current.value = null
  leaveForm.value = {
    leaveTypeId: String(leaveTypeOptions.value[0]?.value || ''),
    startTime: '',
    endTime: '',
    duration: '1',
    unit: 'DAY',
    reason: ''
  }
  overtimeForm.value = {
    startTime: '',
    endTime: '',
    overtimeType: 'WORKDAY',
    compensationType: 'TIME_OFF',
    reason: ''
  }
  showForm.value = true
}

const openEditOvertime = (item: ApplicationRecord) => {
  if (!canEditOvertime(item)) return
  current.value = item
  const overtime = item as HrOvertimeApplicationVO
  overtimeForm.value = {
    startTime: toInputDateTime(overtime.startTime),
    endTime: toInputDateTime(overtime.endTime),
    overtimeType: overtime.overtimeType || 'WORKDAY',
    compensationType: overtime.compensationType || 'TIME_OFF',
    reason: overtime.reason || ''
  }
  showForm.value = true
}

const openDetail = async (item: ApplicationRecord) => {
  showDetail.value = true
  detailLoading.value = true
  try {
    selected.value = isLeave.value ? await getHrLeaveApplication(item.id) : await getHrOvertimeApplication(item.id)
  } catch (error) {
    toast.error(getErrorMessage(error, '详情加载失败'))
  } finally {
    detailLoading.value = false
  }
}

const closeForm = () => {
  showForm.value = false
  current.value = null
}

const validateForm = () => {
  if (!employee.value?.id) throw new Error('当前账号未关联员工档案')
  if (isLeave.value) {
    if (!leaveForm.value.leaveTypeId || !leaveForm.value.startTime || !leaveForm.value.endTime || !leaveForm.value.duration) {
      throw new Error('请完整填写请假信息')
    }
    return
  }
  if (!overtimeForm.value.startTime || !overtimeForm.value.endTime || !overtimeForm.value.overtimeType || !overtimeForm.value.compensationType) {
    throw new Error('请完整填写加班信息')
  }
}

const saveForm = async () => {
  saving.value = true
  try {
    validateForm()
    if (isLeave.value) {
      const payload: HrLeaveApplicationPayload = {
        employeeId: employee.value!.id,
        leaveTypeId: Number(leaveForm.value.leaveTypeId),
        startTime: toApiDateTime(leaveForm.value.startTime),
        endTime: toApiDateTime(leaveForm.value.endTime),
        duration: Number(leaveForm.value.duration || 0),
        unit: leaveForm.value.unit,
        reason: leaveForm.value.reason.trim()
      }
      const id = await createHrLeaveApplication(payload)
      closeForm()
      toast.success('请假申请已创建')
      await fetchList(id)
      return
    }

    const payload: HrOvertimeApplicationPayload = {
      employeeId: employee.value!.id,
      startTime: toApiDateTime(overtimeForm.value.startTime),
      endTime: toApiDateTime(overtimeForm.value.endTime),
      overtimeType: overtimeForm.value.overtimeType,
      compensationType: overtimeForm.value.compensationType,
      reason: overtimeForm.value.reason.trim()
    }
    if (current.value?.id) {
      const updatedId = current.value.id
      await updateHrOvertimeApplication(updatedId, payload)
      toast.success('加班申请已更新')
      closeForm()
      await fetchList(updatedId)
    } else {
      const id = await createHrOvertimeApplication(payload)
      toast.success('加班申请已创建')
      closeForm()
      await fetchList(id)
    }
  } catch (error) {
    toast.error(getErrorMessage(error, '保存申请失败'))
  } finally {
    saving.value = false
  }
}

const openConfirm = (type: ConfirmState['type'], item: ApplicationRecord) => {
  const actionMap: Record<ConfirmState['type'], Omit<ConfirmState, 'id' | 'type'>> = {
    submit: { title: '提交申请', message: '提交后将进入审批流程。', confirmText: '提交' },
    approve: { title: '审批通过', message: '确认通过该申请并更新状态。', confirmText: '通过' },
    reject: { title: '审批拒绝', message: '确认拒绝该申请并更新状态。', confirmText: '拒绝', danger: true },
    cancel: { title: '撤销申请', message: '确认撤销该申请，相关额度会按后端规则恢复。', confirmText: '撤销', danger: true },
    delete: { title: '删除草稿', message: '删除后无法从当前页面恢复。', confirmText: '删除', danger: true }
  }
  confirmState.value = { type, id: item.id, ...actionMap[type] }
}

const runConfirm = async () => {
  if (!confirmState.value) return
  const state = confirmState.value
  saving.value = true
  try {
    if (isLeave.value) {
      if (state.type === 'submit') await submitHrLeaveApplication(state.id)
      if (state.type === 'approve') await approveHrLeaveApplication(state.id)
      if (state.type === 'reject') await rejectHrLeaveApplication(state.id)
      if (state.type === 'cancel') await cancelHrLeaveApplication(state.id)
    } else {
      if (state.type === 'submit') await submitHrOvertimeApplication(state.id)
      if (state.type === 'approve') await approveHrOvertimeApplication(state.id)
      if (state.type === 'reject') await rejectHrOvertimeApplication(state.id)
      if (state.type === 'cancel') await cancelHrOvertimeApplication(state.id)
      if (state.type === 'delete') await deleteHrOvertimeApplication(state.id)
    }
    toast.success('操作成功')
    confirmState.value = null
    await fetchList(state.id)
  } catch (error) {
    toast.error(getErrorMessage(error, '操作失败'))
  } finally {
    saving.value = false
  }
}

watch([pageNum, pageSize], () => {
  void fetchList()
})

watch(moduleKey, async () => {
  pageNum.value = 1
  statusFilter.value = ''
  typeFilter.value = ''
  showForm.value = false
  showDetail.value = false
  await fetchList()
})

onMounted(async () => {
  await loadOptions()
  await fetchList()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <component :is="moduleConfig.icon" class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          {{ moduleConfig.eyebrow }}
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{{ moduleConfig.title }}</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchList()">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新
        </Button>
        <Button :disabled="selfServiceLocked" @click="openAdd">
          <Plus class="h-4 w-4" />{{ moduleConfig.primary }}
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">申请总数</div><div class="mt-2 text-2xl font-semibold">{{ summary.total }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">草稿</div><div class="mt-2 text-2xl font-semibold">{{ summary.draft }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">审批中</div><div class="mt-2 text-2xl font-semibold">{{ summary.approving }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">已通过</div><div class="mt-2 text-2xl font-semibold">{{ summary.approved }}</div></div>
    </div>

    <Panel title="筛选">
      <template #icon><Clock3 class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-5">
        <label class="space-y-2"><span class="text-sm font-medium">类型</span><Select v-model="typeFilter" :options="typeOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="statusFilter" :options="statusOptions" /></label>
        <Input v-model="startDateFrom" label="开始日期从" type="date" />
        <Input v-model="startDateTo" label="开始日期到" type="date" />
        <div class="flex items-end gap-2">
          <Button class="flex-1" @click="pageNum = 1; fetchList()">查询</Button>
          <Button variant="outline" @click="resetFilters">重置</Button>
        </div>
      </div>
      <div v-if="selfServiceRestriction" class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        {{ selfServiceRestriction }}
      </div>
    </Panel>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
      <Panel :title="moduleConfig.title">
        <template #icon><CalendarClock class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="columns" :data="records" :loading="loading" row-key="id">
          <template #cell-applicationNo="{ row }">
            <button type="button" class="text-left" @click="selected = row">
              <div class="font-semibold text-slate-900 dark:text-slate-100">{{ recordNo(row) }}</div>
              <div class="text-xs text-slate-500">{{ formatDateTime(row.createTime) }}</div>
            </button>
          </template>
          <template #cell-employeeName="{ row }">
            <div class="font-medium">{{ recordEmployeeName(row) }}</div>
            <div class="text-xs text-slate-500">{{ recordEmployeeNo(row) }}</div>
          </template>
          <template #cell-leaveTypeName="{ row }">{{ recordLeaveTypeLabel(row) }}</template>
          <template #cell-overtimeType="{ row }">{{ recordOvertimeTypeLabel(row) }}</template>
          <template #cell-startTime="{ row }">
            <div>{{ formatDateTime(row.startTime) }}</div>
            <div class="text-xs text-slate-500">{{ formatDateTime(row.endTime) }}</div>
          </template>
          <template #cell-duration="{ row }">{{ recordDurationLabel(row) }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row)" :tone="recordStatusTone(row)" /></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="icon" variant="ghost" @click="openDetail(row)"><Eye class="h-4 w-4" /></Button>
              <Button v-if="canEditOvertime(row)" size="sm" variant="outline" @click="openEditOvertime(row)">编辑</Button>
              <Button v-if="canSubmit(row)" size="icon" variant="ghost" @click="openConfirm('submit', row)"><Send class="h-4 w-4" /></Button>
              <Button v-if="canApprove(row)" size="icon" variant="ghost" @click="openConfirm('approve', row)"><CheckCircle2 class="h-4 w-4" /></Button>
              <Button v-if="canApprove(row)" size="icon" variant="ghost" @click="openConfirm('reject', row)"><XCircle class="h-4 w-4" /></Button>
              <Button v-if="canCancel(row)" size="sm" variant="outline" @click="openConfirm('cancel', row)">撤销</Button>
              <Button v-if="canEditOvertime(row)" size="icon" variant="ghost" @click="openConfirm('delete', row)"><Trash2 class="h-4 w-4" /></Button>
            </div>
          </template>
          <template #empty>
            <div class="py-10 text-center text-sm text-slate-500">{{ moduleConfig.empty }}</div>
          </template>
        </DataTable>
        <Pagination v-model:page="pageNum" v-model:page-size="pageSize" :total="total" />
      </Panel>

      <Panel title="申请工作区">
        <template #icon><Eye class="h-4 w-4 text-slate-500" /></template>
        <div v-if="selected" class="space-y-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ recordNo(selected) }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ recordEmployeeName(selected) }} · {{ formatDateTime(selected.createTime) }}</div>
              </div>
              <StatusBadge :label="statusLabel(selected)" :tone="recordStatusTone(selected)" />
            </div>
            <div class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{{ recordReason(selected) || '未填写原因' }}</div>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div v-for="item in detailStats" :key="item.label" class="card p-3">
              <div class="text-xs text-slate-500">{{ item.label }}</div>
              <div class="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{{ item.value }}</div>
            </div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
            <div class="font-medium text-slate-900 dark:text-slate-100">时间范围</div>
            <div class="mt-1 text-slate-500">{{ formatDateTime(selected.startTime) }} ~ {{ formatDateTime(selected.endTime) }}</div>
          </div>
          <div v-if="isLeave" class="space-y-2">
            <div class="text-sm font-medium text-slate-900 dark:text-slate-100">年度额度</div>
            <div v-if="selectedQuotas.length" class="space-y-2">
              <div v-for="quota in selectedQuotas.slice(0, 4)" :key="quota.id" class="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                <span>{{ quota.leaveTypeName || quota.id }}</span>
                <span class="text-slate-500">可用 {{ formatNumber(quota.availableQuota) }}</span>
              </div>
            </div>
            <div v-else class="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">暂无额度数据</div>
          </div>
          <div v-else class="grid gap-3 sm:grid-cols-2">
            <div class="card p-3"><div class="text-xs text-slate-500">本月加班</div><div class="mt-1 text-lg font-semibold">{{ formatNumber(overtimeStats?.totalHours) }}小时</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">本月次数</div><div class="mt-1 text-lg font-semibold">{{ formatNumber(overtimeStats?.overtimeCount) }}</div></div>
          </div>
        </div>
        <div v-else class="py-12 text-center text-sm text-slate-500">请选择申请记录</div>
      </Panel>
    </div>

    <BaseDialog :show="showForm" :title="current ? '编辑申请' : moduleConfig.primary" width="wide" @close="closeForm">
      <div v-if="isLeave" class="grid gap-4 md:grid-cols-2">
        <Input :model-value="employee ? buildEmployeeLabel(employee) : ''" label="员工" disabled />
        <label class="space-y-2"><span class="text-sm font-medium">假种</span><Select v-model="leaveForm.leaveTypeId" :options="leaveTypeOptions" searchable /></label>
        <Input v-model="leaveForm.startTime" label="开始时间" type="datetime-local" required />
        <Input v-model="leaveForm.endTime" label="结束时间" type="datetime-local" required />
        <Input v-model="leaveForm.duration" label="请假时长" type="number" required />
        <label class="space-y-2"><span class="text-sm font-medium">单位</span><Select v-model="leaveForm.unit" :options="unitOptions" /></label>
        <TextArea v-model="leaveForm.reason" label="请假原因" class="md:col-span-2" />
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <Input :model-value="employee ? buildEmployeeLabel(employee) : ''" label="员工" disabled />
        <label class="space-y-2"><span class="text-sm font-medium">加班类型</span><Select v-model="overtimeForm.overtimeType" :options="overtimeTypeOptions" /></label>
        <Input v-model="overtimeForm.startTime" label="开始时间" type="datetime-local" required />
        <Input v-model="overtimeForm.endTime" label="结束时间" type="datetime-local" required />
        <label class="space-y-2"><span class="text-sm font-medium">补偿类型</span><Select v-model="overtimeForm.compensationType" :options="compensationTypeOptions" /></label>
        <TextArea v-model="overtimeForm.reason" label="加班原因" class="md:col-span-2" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeForm">取消</Button>
          <Button :disabled="saving" @click="saveForm"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <BaseDialog :show="showDetail" title="申请详情" width="wide" @close="showDetail = false">
      <div v-if="detailLoading" class="py-10 text-center text-sm text-slate-500">加载中...</div>
      <div v-else-if="selected" class="space-y-4">
        <div class="grid gap-3 md:grid-cols-2">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500">申请编号</div>
            <div class="mt-1 font-semibold">{{ recordNo(selected) }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500">状态</div>
            <div class="mt-1"><StatusBadge :label="statusLabel(selected)" :tone="recordStatusTone(selected)" /></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500">开始时间</div>
            <div class="mt-1 font-semibold">{{ formatDateTime(selected.startTime) }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500">结束时间</div>
            <div class="mt-1 font-semibold">{{ formatDateTime(selected.endTime) }}</div>
          </div>
        </div>
        <TextArea :model-value="recordReason(selected)" label="原因" readonly />
      </div>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(confirmState)"
      :title="confirmState?.title || ''"
      :message="confirmState?.message || ''"
      :confirm-text="confirmState?.confirmText || '确认'"
      :danger="confirmState?.danger"
      @cancel="confirmState = null"
      @confirm="runConfirm"
    />
  </div>
</template>
