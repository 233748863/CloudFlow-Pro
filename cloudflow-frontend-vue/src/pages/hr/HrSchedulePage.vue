<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { CalendarClock, CalendarDays, CheckCircle2, Clock3, Edit3, Layers3, Plus, RefreshCcw, Save, Send, Trash2 } from 'lucide-vue-next'
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
  type DeptTreeNode,
  type HrEmployee,
  type HrScheduleCalendar,
  type HrSchedulePlan,
  type HrSchedulePlanBatchPayload,
  type HrSchedulePlanPayload,
  type HrSchedulePlanQuery,
  type HrScheduleTargetType,
  type HrShift,
  type PostOption,
  batchCreateHrSchedulePlans,
  cancelHrSchedulePlan,
  createHrShift,
  createHrSchedulePlan,
  deleteHrShift,
  getDeptTreeOptions,
  getHrScheduleCalendar,
  getPostOptions,
  listEmployees,
  listHrSchedulePlans,
  listHrShifts,
  publishHrSchedulePlans,
  updateHrShift
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { buildEmployeeLabel, flattenDeptTree, formatNumber, normalizeRows, statusTone, todayValue } from './hrUtils'

type DialogMode = 'single' | 'batch' | 'shift' | null
type NullableId = string | number | null
type ConfirmState = {
  type: 'publish' | 'cancel' | 'deleteShift'
  ids: number[]
  title: string
  message: string
  confirmText: string
  danger?: boolean
}

const TARGET_LABEL: Record<string, string> = {
  EMPLOYEE: '员工',
  POST: '岗位',
  DEPT: '部门'
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  CANCELLED: '已取消'
}

const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const toast = useToastStore()
const loading = ref(false)
const optionLoading = ref(false)
const calendarLoading = ref(false)
const saving = ref(false)
const dialogMode = ref<DialogMode>(null)
const confirmState = ref<ConfirmState | null>(null)
const editingShiftId = ref<number | null>(null)
const plans = ref<HrSchedulePlan[]>([])
const shifts = ref<HrShift[]>([])
const employees = ref<HrEmployee[]>([])
const depts = ref<DeptTreeNode[]>([])
const posts = ref<PostOption[]>([])
const scheduleCalendar = ref<HrScheduleCalendar | null>(null)
const selectedPlanIds = ref<Set<number>>(new Set())
const selectedCalendarEmployeeId = ref<NullableId>('')
const selectedMonth = ref(formatMonth(new Date()))
const batchTargetPick = ref<NullableId>('')

const filters = ref<{
  targetType: '' | HrScheduleTargetType
  targetId: NullableId
  shiftId: NullableId
  status: string
  startDate: string
  endDate: string
}>({
  targetType: '',
  targetId: '',
  shiftId: '',
  status: '',
  startDate: monthStart(selectedMonth.value),
  endDate: monthEnd(selectedMonth.value)
})

const singleForm = ref({
  planName: '',
  targetType: 'EMPLOYEE' as HrScheduleTargetType,
  targetId: '' as NullableId,
  shiftId: '' as NullableId,
  scheduleDate: todayValue()
})

const batchForm = ref({
  planName: '',
  targetType: 'EMPLOYEE' as HrScheduleTargetType,
  targetIdsText: '',
  shiftId: '' as NullableId,
  startDate: filters.value.startDate,
  endDate: filters.value.endDate
})

const shiftForm = ref({
  shiftCode: '',
  shiftName: '',
  startTime: '09:00',
  endTime: '18:00',
  breakMinutes: '60',
  lateThreshold: '15',
  earlyThreshold: '15',
  color: '#14b8a6',
  status: 1
})

const planColumns: Column<HrSchedulePlan>[] = [
  { key: 'planName', label: '计划' },
  { key: 'targetType', label: '目标' },
  { key: 'shiftName', label: '班次' },
  { key: 'scheduleDate', label: '日期', sortable: true },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const shiftColumns: Column<HrShift>[] = [
  { key: 'shiftName', label: '班次' },
  { key: 'startTime', label: '时间' },
  { key: 'workMinutes', label: '工时' },
  { key: 'lateThreshold', label: '阈值' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const targetTypeOptions: SelectOption[] = [
  { value: '', label: '全部类型' },
  { value: 'EMPLOYEE', label: '员工' },
  { value: 'POST', label: '岗位' },
  { value: 'DEPT', label: '部门' }
]

const formTargetTypeOptions: SelectOption[] = targetTypeOptions.filter((item) => item.value)

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'CANCELLED', label: '已取消' }
]

const shiftStatusOptions: SelectOption[] = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
]

const shiftOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部班次' },
  ...shifts.value.map((item) => ({
    value: item.id,
    label: `${item.shiftName} ${normalizeTime(item.startTime)}-${normalizeTime(item.endTime)}`
  }))
])

const formShiftOptions = computed<SelectOption[]>(() => shiftOptions.value.filter((item) => item.value))

const employeeOptions = computed<SelectOption[]>(() =>
  employees.value.map((item) => ({ value: item.id, label: buildEmployeeLabel(item) }))
)

const calendarCells = computed(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const days = new Date(year, month, 0).getDate()
  const planMap = new Map((scheduleCalendar.value?.schedulePlans || []).map((item) => [item.scheduleDate, item]))
  return Array.from({ length: days }, (_, index) => {
    const date = formatLocalDate(new Date(year, month - 1, index + 1))
    return {
      date,
      day: index + 1,
      weekday: WEEKDAY_LABEL[new Date(year, month - 1, index + 1).getDay()],
      plan: planMap.get(date) || null
    }
  })
})

const summary = computed(() => {
  const targetCount = new Set(plans.value.map((item) => `${item.targetType}:${item.targetId}`)).size
  const dateCount = new Set(plans.value.map((item) => item.scheduleDate)).size
  return {
    total: plans.value.length,
    draft: plans.value.filter((item) => planStatus(item) === 'DRAFT').length,
    published: plans.value.filter((item) => planStatus(item) === 'PUBLISHED').length,
    cancelled: plans.value.filter((item) => planStatus(item) === 'CANCELLED').length,
    targetCount,
    dateCount
  }
})

const selectedDraftIds = computed(() =>
  [...selectedPlanIds.value].filter((id) => {
    const plan = plans.value.find((item) => item.id === id)
    return plan && planStatus(plan) === 'DRAFT'
  })
)

const activeShiftCount = computed(() => shifts.value.filter((item) => item.status !== 0).length)

const dialogTitle = computed(() => {
  if (dialogMode.value === 'batch') return '批量排班'
  if (dialogMode.value === 'shift') return editingShiftId.value ? '编辑班次' : '新增班次'
  return '新建排班'
})

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonth(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function monthStart(monthValue: string) {
  return `${monthValue}-01`
}

function monthEnd(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number)
  return formatLocalDate(new Date(year, month, 0))
}

function normalizeTime(value?: string) {
  return String(value || '').slice(0, 5)
}

function minutesToHours(value?: number) {
  return `${formatNumber(Number(value || 0) / 60)} 小时`
}

function normalizeId(value: NullableId) {
  if (value === '' || value == null) return undefined
  return Number(value)
}

function planStatus(plan: HrSchedulePlan) {
  return String(plan.status || '').toUpperCase()
}

function statusLabel(status?: string) {
  return STATUS_LABEL[String(status || '').toUpperCase()] || status || '-'
}

function planStatusTone(status?: string) {
  const value = String(status || '').toUpperCase()
  if (value === 'PUBLISHED') return 'green'
  if (value === 'CANCELLED') return 'red'
  return statusTone(value)
}

function shiftStatusLabel(status?: number) {
  return status === 0 ? '停用' : '启用'
}

function targetTypeLabel(type?: string) {
  return TARGET_LABEL[String(type || '').toUpperCase()] || type || '-'
}

function targetOptions(type: string, includeAll = false): SelectOption[] {
  const prefix = includeAll ? [{ value: '', label: '全部目标' }] : []
  if (type === 'EMPLOYEE') return [...prefix, ...employeeOptions.value]
  if (type === 'POST') {
    return [
      ...prefix,
      ...normalizeRows<PostOption>(posts.value).map((item) => ({
        value: item.postId,
        label: [item.postName, item.postCode].filter(Boolean).join(' / ')
      }))
    ]
  }
  if (type === 'DEPT') {
    return [
      ...prefix,
      ...flattenDeptTree(depts.value).map((item) => ({
        value: item.deptId,
        label: item.deptName
      }))
    ]
  }
  return prefix
}

function parseTargetIds(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,，;；]+/)
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  )
}

function countDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

function syncSelectionAfterLoad() {
  const existingIds = new Set(plans.value.map((item) => item.id))
  selectedPlanIds.value = new Set([...selectedPlanIds.value].filter((id) => existingIds.has(id)))
}

function toggleSelection(id: number, checked: boolean) {
  const next = new Set(selectedPlanIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedPlanIds.value = next
}

function buildPlanQuery(): HrSchedulePlanQuery {
  return {
    targetType: filters.value.targetType || undefined,
    targetId: normalizeId(filters.value.targetId),
    shiftId: normalizeId(filters.value.shiftId),
    status: filters.value.status || undefined,
    startDate: filters.value.startDate || undefined,
    endDate: filters.value.endDate || undefined
  }
}

async function loadOptions() {
  optionLoading.value = true
  try {
    const [employeeRes, deptRes, postRes, shiftRes] = await Promise.allSettled([
      listEmployees({ pageNum: 1, pageSize: 500 }),
      getDeptTreeOptions(),
      getPostOptions(),
      listHrShifts()
    ])
    employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
    depts.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
    posts.value = postRes.status === 'fulfilled' ? normalizeRows<PostOption>(postRes.value) : []
    shifts.value = shiftRes.status === 'fulfilled' ? normalizeRows<HrShift>(shiftRes.value) : []
    selectedCalendarEmployeeId.value ||= employees.value[0]?.id || ''
  } catch (error) {
    toast.error(getErrorMessage(error, '排班基础选项加载失败'))
  } finally {
    optionLoading.value = false
  }
}

async function loadPlans() {
  loading.value = true
  try {
    plans.value = normalizeRows<HrSchedulePlan>(await listHrSchedulePlans(buildPlanQuery()))
    syncSelectionAfterLoad()
  } catch (error) {
    toast.error(getErrorMessage(error, '排班计划加载失败'))
  } finally {
    loading.value = false
  }
}

async function loadCalendar() {
  const employeeId = normalizeId(selectedCalendarEmployeeId.value)
  if (!employeeId) {
    scheduleCalendar.value = null
    return
  }
  calendarLoading.value = true
  try {
    scheduleCalendar.value = await getHrScheduleCalendar(employeeId, selectedMonth.value)
  } catch (error) {
    scheduleCalendar.value = null
    toast.error(getErrorMessage(error, '员工排班日历加载失败'))
  } finally {
    calendarLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadPlans(), loadCalendar()])
}

async function reloadShifts() {
  shifts.value = normalizeRows<HrShift>(await listHrShifts())
}

function resetFilters() {
  filters.value = {
    targetType: '',
    targetId: '',
    shiftId: '',
    status: '',
    startDate: monthStart(selectedMonth.value),
    endDate: monthEnd(selectedMonth.value)
  }
  void loadPlans()
}

function openSingleDialog(date?: string) {
  singleForm.value = {
    planName: `单日排班-${date || todayValue()}`,
    targetType: 'EMPLOYEE',
    targetId: selectedCalendarEmployeeId.value || '',
    shiftId: shifts.value[0]?.id || '',
    scheduleDate: date || todayValue()
  }
  dialogMode.value = 'single'
}

function openBatchDialog() {
  batchTargetPick.value = selectedCalendarEmployeeId.value || ''
  batchForm.value = {
    planName: `批量排班-${filters.value.startDate}`,
    targetType: 'EMPLOYEE',
    targetIdsText: selectedCalendarEmployeeId.value ? String(selectedCalendarEmployeeId.value) : '',
    shiftId: shifts.value[0]?.id || '',
    startDate: filters.value.startDate,
    endDate: filters.value.endDate
  }
  dialogMode.value = 'batch'
}

function openShiftDialog(shift?: HrShift) {
  editingShiftId.value = shift?.id || null
  shiftForm.value = {
    shiftCode: shift?.shiftCode || '',
    shiftName: shift?.shiftName || '',
    startTime: normalizeTime(shift?.startTime) || '09:00',
    endTime: normalizeTime(shift?.endTime) || '18:00',
    breakMinutes: String(shift?.breakMinutes ?? 60),
    lateThreshold: String(shift?.lateThreshold ?? 15),
    earlyThreshold: String(shift?.earlyThreshold ?? 15),
    color: shift?.color || '#14b8a6',
    status: shift?.status ?? 1
  }
  dialogMode.value = 'shift'
}

function appendBatchTarget() {
  const targetId = normalizeId(batchTargetPick.value)
  if (!targetId) return
  const ids = new Set(parseTargetIds(batchForm.value.targetIdsText))
  ids.add(targetId)
  batchForm.value.targetIdsText = [...ids].join('\n')
}

function validateSinglePayload(): HrSchedulePlanPayload {
  const targetId = normalizeId(singleForm.value.targetId)
  const shiftId = normalizeId(singleForm.value.shiftId)
  if (!singleForm.value.planName.trim()) throw new Error('计划名称不能为空')
  if (!targetId) throw new Error('请选择排班目标')
  if (!shiftId) throw new Error('请选择班次')
  if (!singleForm.value.scheduleDate) throw new Error('请选择排班日期')
  return {
    planName: singleForm.value.planName.trim(),
    targetType: singleForm.value.targetType,
    targetId,
    shiftId,
    scheduleDate: singleForm.value.scheduleDate
  }
}

function validateBatchPayload(): HrSchedulePlanBatchPayload {
  const shiftId = normalizeId(batchForm.value.shiftId)
  const targetIds = parseTargetIds(batchForm.value.targetIdsText)
  if (!batchForm.value.planName.trim()) throw new Error('计划名称不能为空')
  if (!targetIds.length) throw new Error('目标 ID 列表不能为空')
  if (!shiftId) throw new Error('请选择班次')
  if (!batchForm.value.startDate || !batchForm.value.endDate) throw new Error('请选择日期范围')
  if (countDays(batchForm.value.startDate, batchForm.value.endDate) > 31) throw new Error('批量排班最多支持 31 天')
  return {
    planName: batchForm.value.planName.trim(),
    targetType: batchForm.value.targetType,
    targetIds,
    shiftId,
    startDate: batchForm.value.startDate,
    endDate: batchForm.value.endDate
  }
}

function validateShiftPayload() {
  if (!editingShiftId.value && !shiftForm.value.shiftCode.trim()) throw new Error('班次编码不能为空')
  if (!shiftForm.value.shiftName.trim()) throw new Error('班次名称不能为空')
  if (!shiftForm.value.startTime || !shiftForm.value.endTime) throw new Error('上下班时间不能为空')
  return {
    shiftCode: shiftForm.value.shiftCode.trim(),
    shiftName: shiftForm.value.shiftName.trim(),
    startTime: shiftForm.value.startTime,
    endTime: shiftForm.value.endTime,
    breakMinutes: Number(shiftForm.value.breakMinutes || 0),
    lateThreshold: Number(shiftForm.value.lateThreshold || 15),
    earlyThreshold: Number(shiftForm.value.earlyThreshold || 15),
    color: shiftForm.value.color || '#14b8a6',
    status: shiftForm.value.status
  }
}

async function saveDialog() {
  saving.value = true
  try {
    if (dialogMode.value === 'single') await createHrSchedulePlan(validateSinglePayload())
    if (dialogMode.value === 'batch') await batchCreateHrSchedulePlans(validateBatchPayload())
    if (dialogMode.value === 'shift') {
      const payload = validateShiftPayload()
      if (editingShiftId.value) {
        const { shiftCode: _shiftCode, ...updatePayload } = payload
        await updateHrShift(editingShiftId.value, updatePayload)
      }
      else await createHrShift(payload)
      await reloadShifts()
    }
    dialogMode.value = null
    toast.success('保存成功')
    await refreshAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

function openPublish(ids: number[]) {
  const draftIds = ids.filter((id) => plans.value.some((item) => item.id === id && planStatus(item) === 'DRAFT'))
  if (!draftIds.length) {
    toast.error('请选择草稿状态的排班计划')
    return
  }
  confirmState.value = {
    type: 'publish',
    ids: draftIds,
    title: '发布排班计划',
    message: `确认发布 ${draftIds.length} 条排班计划？`,
    confirmText: '发布'
  }
}

function openCancel(plan: HrSchedulePlan) {
  confirmState.value = {
    type: 'cancel',
    ids: [plan.id],
    title: '取消排班计划',
    message: `确认取消 ${plan.planName}？`,
    confirmText: '取消排班',
    danger: true
  }
}

function openDeleteShift(shift: HrShift) {
  confirmState.value = {
    type: 'deleteShift',
    ids: [shift.id],
    title: '删除班次',
    message: `确认删除 ${shift.shiftName}？已被未取消排班引用的班次不能删除。`,
    confirmText: '删除',
    danger: true
  }
}

async function runConfirm() {
  if (!confirmState.value) return
  const type = confirmState.value.type
  const id = confirmState.value.ids[0]
  const ids = [...confirmState.value.ids]
  saving.value = true
  try {
    if (type === 'publish') await publishHrSchedulePlans(ids)
    if (type === 'cancel') await cancelHrSchedulePlan(id)
    if (type === 'deleteShift') await deleteHrShift(id)
    confirmState.value = null
    toast.success('操作成功')
    if (type === 'deleteShift') await reloadShifts()
    await refreshAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '排班计划操作失败'))
  } finally {
    saving.value = false
  }
}

watch(() => filters.value.targetType, () => {
  filters.value.targetId = ''
})

watch(() => singleForm.value.targetType, () => {
  singleForm.value.targetId = ''
})

watch(() => batchForm.value.targetType, () => {
  batchForm.value.targetIdsText = ''
  batchTargetPick.value = ''
})

watch([selectedCalendarEmployeeId, selectedMonth], () => {
  void loadCalendar()
})

watch(selectedMonth, (value) => {
  filters.value.startDate = monthStart(value)
  filters.value.endDate = monthEnd(value)
})

onMounted(async () => {
  await loadOptions()
  await refreshAll()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <CalendarClock class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          HR Schedule
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">排班计划</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">按员工、岗位、部门生成排班，发布后进入考勤计算链路</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading || calendarLoading" @click="refreshAll">
          <RefreshCcw class="h-4 w-4" :class="loading || calendarLoading ? 'animate-spin' : ''" />
          刷新
        </Button>
        <Button variant="outline" @click="openBatchDialog">
          <Layers3 class="h-4 w-4" />
          批量排班
        </Button>
        <Button @click="openSingleDialog()">
          <Plus class="h-4 w-4" />
          新建排班
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="card p-4">
        <div class="text-xs text-slate-500">计划总数</div>
        <div class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ formatNumber(summary.total) }}</div>
        <div class="mt-1 text-xs text-slate-500">覆盖 {{ formatNumber(summary.targetCount) }} 个目标</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-slate-500">已发布</div>
        <div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.published) }}</div>
        <div class="mt-1 text-xs text-slate-500">日期 {{ formatNumber(summary.dateCount) }} 天</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-slate-500">草稿待发布</div>
        <div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.draft) }}</div>
        <div class="mt-1 text-xs text-slate-500">已选草稿 {{ formatNumber(selectedDraftIds.length) }} 条</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-slate-500">员工月历</div>
        <div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(scheduleCalendar?.statistics?.totalDays) }}</div>
        <div class="mt-1 text-xs text-slate-500">预计 {{ formatNumber(scheduleCalendar?.statistics?.expectedWorkHours) }} 小时</div>
      </div>
    </div>

    <Panel title="班次维护">
      <template #icon><Clock3 class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <Button size="sm" @click="openShiftDialog()">
          <Plus class="h-3.5 w-3.5" />
          新增班次
        </Button>
      </template>
      <div class="mb-3 grid gap-3 md:grid-cols-3">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <div class="text-xs text-slate-500">班次数</div>
          <div class="mt-1 text-lg font-semibold">{{ formatNumber(shifts.length) }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <div class="text-xs text-slate-500">启用班次</div>
          <div class="mt-1 text-lg font-semibold">{{ formatNumber(activeShiftCount) }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <div class="text-xs text-slate-500">当前筛选</div>
          <div class="mt-1 text-lg font-semibold">{{ filters.shiftId ? '指定班次' : '全部班次' }}</div>
        </div>
      </div>
      <DataTable :columns="shiftColumns" :data="shifts" :loading="optionLoading" row-key="id">
        <template #cell-shiftName="{ row }">
          <div class="flex items-center gap-3">
            <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: row.color || '#14b8a6' }" />
            <div>
              <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.shiftName }}</div>
              <div class="text-xs text-slate-500">{{ row.shiftCode || '-' }}</div>
            </div>
          </div>
        </template>
        <template #cell-startTime="{ row }">
          {{ normalizeTime(row.startTime) }} - {{ normalizeTime(row.endTime) }}
          <div class="text-xs text-slate-500">休息 {{ formatNumber(row.breakMinutes) }} 分钟</div>
        </template>
        <template #cell-workMinutes="{ row }">{{ minutesToHours(row.workMinutes) }}</template>
        <template #cell-lateThreshold="{ row }">迟到 {{ formatNumber(row.lateThreshold) }} / 早退 {{ formatNumber(row.earlyThreshold) }} 分钟</template>
        <template #cell-status="{ row }"><StatusBadge :label="shiftStatusLabel(row.status)" :tone="statusTone(row.status ?? 1)" /></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openShiftDialog(row)">
              <Edit3 class="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" @click="openDeleteShift(row)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <Panel title="筛选与动作">
      <template #icon><CalendarDays class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label class="space-y-2">
          <span class="text-sm font-medium">月份</span>
          <Input v-model="selectedMonth" type="month" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">目标类型</span>
          <Select v-model="filters.targetType" :options="targetTypeOptions" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">目标</span>
          <Select v-model="filters.targetId" :options="targetOptions(filters.targetType, true)" :disabled="!filters.targetType" searchable />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">班次</span>
          <Select v-model="filters.shiftId" :options="shiftOptions" :disabled="optionLoading" searchable />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">状态</span>
          <Select v-model="filters.status" :options="statusOptions" />
        </label>
        <div class="flex items-end gap-2">
          <Button class="flex-1" @click="loadPlans">查询</Button>
          <Button variant="outline" @click="resetFilters">重置</Button>
        </div>
      </div>
      <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
        <Input v-model="filters.startDate" label="开始日期" type="date" />
        <Input v-model="filters.endDate" label="结束日期" type="date" />
        <div class="flex items-end">
          <Button variant="success" :disabled="selectedDraftIds.length === 0" @click="openPublish(selectedDraftIds)">
            <Send class="h-4 w-4" />
            发布已选
          </Button>
        </div>
      </div>
    </Panel>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.78fr)]">
      <Panel title="排班计划列表">
        <template #icon><Layers3 class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="planColumns" :data="plans" :loading="loading" row-key="id">
          <template #cell-planName="{ row }">
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                class="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                :checked="selectedPlanIds.has(row.id)"
                :disabled="planStatus(row) !== 'DRAFT'"
                @change="toggleSelection(row.id, ($event.target as HTMLInputElement).checked)"
              />
              <div>
                <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.planName }}</div>
                <div class="mt-0.5 text-xs text-slate-500">#{{ row.id }} · {{ row.createTime ? String(row.createTime).replace('T', ' ').slice(0, 16) : '-' }}</div>
              </div>
            </div>
          </template>
          <template #cell-targetType="{ row }">
            <div class="font-medium text-slate-900 dark:text-slate-100">{{ row.targetName || row.targetId }}</div>
            <div class="text-xs text-slate-500">{{ targetTypeLabel(row.targetType) }}</div>
          </template>
          <template #cell-shiftName="{ row }">
            <div>{{ row.shiftName || row.shiftId }}</div>
            <div class="text-xs text-slate-500">{{ row.shiftCode || '-' }}</div>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :label="statusLabel(row.status)" :tone="planStatusTone(row.status)" />
          </template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button v-if="planStatus(row) === 'DRAFT'" size="icon" variant="ghost" @click="openPublish([row.id])">
                <CheckCircle2 class="h-4 w-4" />
              </Button>
              <Button v-if="planStatus(row) !== 'CANCELLED'" size="icon" variant="ghost" @click="openCancel(row)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </template>
        </DataTable>
      </Panel>

      <Panel title="员工月度排班">
        <template #icon><CalendarClock class="h-4 w-4 text-slate-500" /></template>
        <div class="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label class="space-y-2">
            <span class="text-sm font-medium">员工</span>
            <Select v-model="selectedCalendarEmployeeId" :options="employeeOptions" searchable />
          </label>
          <div class="flex items-end">
            <Button variant="outline" :disabled="!selectedCalendarEmployeeId" @click="openSingleDialog(todayValue())">
              <Plus class="h-4 w-4" />
              今日排班
            </Button>
          </div>
        </div>
        <div class="mb-3 grid gap-3 sm:grid-cols-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500">总排班</div>
            <div class="mt-1 text-lg font-semibold">{{ formatNumber(scheduleCalendar?.statistics?.totalDays) }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500">工作日</div>
            <div class="mt-1 text-lg font-semibold">{{ formatNumber(scheduleCalendar?.statistics?.workDays) }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500">休息日</div>
            <div class="mt-1 text-lg font-semibold">{{ formatNumber(scheduleCalendar?.statistics?.restDays) }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-xs text-slate-500">工时</div>
            <div class="mt-1 text-lg font-semibold">{{ formatNumber(scheduleCalendar?.statistics?.expectedWorkHours) }}</div>
          </div>
        </div>
        <div v-if="calendarLoading" class="py-12 text-center text-sm text-slate-500">日历加载中...</div>
        <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
          <button
            v-for="cell in calendarCells"
            :key="cell.date"
            type="button"
            class="min-h-[92px] rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/20"
            @click="openSingleDialog(cell.date)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ cell.day }}</span>
              <span class="text-xs text-slate-500">{{ cell.weekday }}</span>
            </div>
            <div v-if="cell.plan" class="mt-3">
              <StatusBadge :label="statusLabel(cell.plan.status)" :tone="planStatusTone(cell.plan.status)" />
              <div class="mt-2 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{{ cell.plan.shiftName || cell.plan.shiftId }}</div>
              <div class="truncate text-xs text-slate-500">{{ cell.plan.planName }}</div>
            </div>
            <div v-else class="mt-5 text-xs text-slate-400">未排班</div>
          </button>
        </div>
      </Panel>
    </div>

    <BaseDialog :show="Boolean(dialogMode)" :title="dialogTitle" width="wide" @close="dialogMode = null">
      <div v-if="dialogMode === 'single'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="singleForm.planName" label="计划名称" required />
        <Input v-model="singleForm.scheduleDate" label="排班日期" type="date" required />
        <label class="space-y-2">
          <span class="text-sm font-medium">目标类型</span>
          <Select v-model="singleForm.targetType" :options="formTargetTypeOptions" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">目标</span>
          <Select v-model="singleForm.targetId" :options="targetOptions(singleForm.targetType)" searchable />
        </label>
        <label class="space-y-2 md:col-span-2">
          <span class="text-sm font-medium">班次</span>
          <Select v-model="singleForm.shiftId" :options="formShiftOptions" searchable />
        </label>
      </div>

      <div v-else-if="dialogMode === 'batch'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="batchForm.planName" label="计划名称" required />
        <label class="space-y-2">
          <span class="text-sm font-medium">目标类型</span>
          <Select v-model="batchForm.targetType" :options="formTargetTypeOptions" />
        </label>
        <Input v-model="batchForm.startDate" label="开始日期" type="date" required />
        <Input v-model="batchForm.endDate" label="结束日期" type="date" required />
        <label class="space-y-2 md:col-span-2">
          <span class="text-sm font-medium">班次</span>
          <Select v-model="batchForm.shiftId" :options="formShiftOptions" searchable />
        </label>
        <div class="md:col-span-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label class="space-y-2">
            <span class="text-sm font-medium">选择目标并加入</span>
            <Select v-model="batchTargetPick" :options="targetOptions(batchForm.targetType)" searchable />
          </label>
          <div class="flex items-end">
            <Button variant="outline" @click="appendBatchTarget">
              <Plus class="h-4 w-4" />
              加入
            </Button>
          </div>
        </div>
        <TextArea v-model="batchForm.targetIdsText" class="md:col-span-2" label="目标 ID 列表" :rows="5" hint="多个 ID 可用换行、逗号或空格分隔；后端单次批量日期范围上限为 31 天。" required />
      </div>

      <div v-else-if="dialogMode === 'shift'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="shiftForm.shiftCode" label="班次编码" :disabled="Boolean(editingShiftId)" required />
        <Input v-model="shiftForm.shiftName" label="班次名称" required />
        <Input v-model="shiftForm.startTime" label="上班时间" type="time" required />
        <Input v-model="shiftForm.endTime" label="下班时间" type="time" required />
        <Input v-model="shiftForm.breakMinutes" label="休息时长（分钟）" type="number" />
        <Input v-model="shiftForm.lateThreshold" label="迟到阈值（分钟）" type="number" />
        <Input v-model="shiftForm.earlyThreshold" label="早退阈值（分钟）" type="number" />
        <label class="space-y-2">
          <span class="text-sm font-medium">状态</span>
          <Select v-model="shiftForm.status" :options="shiftStatusOptions" />
        </label>
        <Input v-model="shiftForm.color" label="日历颜色" type="color" />
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="dialogMode = null">取消</Button>
          <Button :disabled="saving" @click="saveDialog">
            <Save class="h-4 w-4" />
            保存
          </Button>
        </div>
      </template>
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
