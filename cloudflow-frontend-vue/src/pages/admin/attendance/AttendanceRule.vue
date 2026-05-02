<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Plus,
  Save,
  Trash2,
  Users,
  Wifi
} from 'lucide-vue-next'
import {
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
  type AttendanceRuleAssignment,
  type AttendanceRuleConfig,
  type HrScheduleRule,
  type HrShift,
  type WorkCalendarDay,
  createHrScheduleRule,
  createHrScheduleRuleAssignment,
  createWorkCalendarDay,
  deleteHrScheduleRule,
  deleteHrScheduleRuleAssignment,
  deleteWorkCalendarDay,
  listHrScheduleRuleAssignments,
  listHrScheduleRules,
  listHrShifts,
  listWorkCalendarDays,
  updateHrScheduleRule,
  updateWorkCalendarDay
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

const WEEKDAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' }
]

const RULE_TYPE_LABEL: Record<string, string> = {
  FIXED: '固定班',
  ROTATION: '轮班',
  FLEXIBLE: '弹性',
  COMPREHENSIVE: '综合工时'
}

const TARGET_LABEL: Record<string, string> = {
  DEPT: '部门',
  POST: '岗位',
  EMPLOYEE: '员工'
}

const DAY_TYPE_LABEL: Record<string, string> = {
  WORKDAY: '工作日',
  REST: '休息日',
  HOLIDAY: '节假日'
}

const ruleTypeOptions: SelectOption[] = [
  { value: 'FIXED', label: '固定班' },
  { value: 'ROTATION', label: '轮班' },
  { value: 'FLEXIBLE', label: '弹性工作制' },
  { value: 'COMPREHENSIVE', label: '综合工时制' }
]

const statusOptions: SelectOption[] = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
]

const targetTypeOptions: SelectOption[] = [
  { value: 'DEPT', label: '部门' },
  { value: 'POST', label: '岗位' },
  { value: 'EMPLOYEE', label: '员工' }
]

const dayTypeOptions: SelectOption[] = [
  { value: 'WORKDAY', label: '工作日' },
  { value: 'REST', label: '休息日' },
  { value: 'HOLIDAY', label: '节假日' }
]

const boolOptions: SelectOption[] = [
  { value: true, label: '开启' },
  { value: false, label: '关闭' }
]

const assignmentColumns: Column<AttendanceRuleAssignment>[] = [
  { key: 'targetType', label: '类型' },
  { key: 'targetName', label: '目标' },
  { key: 'effectiveStart', label: '生效日期', sortable: true },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const calendarColumns: Column<WorkCalendarDay>[] = [
  { key: 'calendarDate', label: '日期', sortable: true },
  { key: 'dayName', label: '名称' },
  { key: 'dayType', label: '类型' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const toast = useToastStore()
const activeTab = ref<'rule' | 'assignment' | 'calendar'>('rule')
const rules = ref<HrScheduleRule[]>([])
const shifts = ref<HrShift[]>([])
const selectedId = ref<number | null>(null)
const draft = ref<HrScheduleRule | null>(null)
const config = ref<AttendanceRuleConfig>({})
const assignments = ref<AttendanceRuleAssignment[]>([])
const calendarDays = ref<WorkCalendarDay[]>([])
const loading = ref(false)
const saving = ref(false)

const assignmentDraft = ref({
  targetType: 'DEPT' as 'DEPT' | 'POST' | 'EMPLOYEE',
  targetId: '',
  effectiveStart: formatTodayDate()
})

const calendarDraft = ref({
  calendarDate: formatTodayDate(),
  dayType: 'WORKDAY' as 'WORKDAY' | 'REST' | 'HOLIDAY',
  dayName: ''
})

function defaultConfig(shiftId?: number): AttendanceRuleConfig {
  return {
    shiftId,
    workDays: [1, 2, 3, 4, 5],
    checkMethods: ['GPS', 'WIFI', 'FACE'],
    locationPoints: [{ name: '总部园区', latitude: 39.9042, longitude: 116.4074, radius: 500 }],
    wifiConfigs: [{ ssid: 'CloudFlow-Office' }],
    overtimeEnabled: true,
    overtimeMinMinutes: 30,
    lateToleranceCount: 0,
    severeLateMinutes: 60,
    absentMinutes: 240,
    photoRequired: false,
    radius: 500
  }
}

function parseConfig(value?: string): AttendanceRuleConfig {
  if (!value) return defaultConfig()
  try {
    return { ...defaultConfig(), ...JSON.parse(value) }
  } catch {
    return defaultConfig()
  }
}

function formatTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const normalizeTime = (value?: string) => (value || '').slice(0, 5)

const createDraftRule = (shiftId?: number): HrScheduleRule => ({
  id: 0,
  ruleName: '新考勤规则',
  ruleType: 'FIXED',
  ruleConfig: JSON.stringify(defaultConfig(shiftId)),
  description: '',
  status: 1
})

const selectedShift = computed(() =>
  shifts.value.find((item) => item.id === Number(config.value.shiftId))
)
const shiftOptions = computed<SelectOption[]>(() =>
  shifts.value.map((shift) => ({
    value: shift.id,
    label: `${shift.shiftName} ${normalizeTime(shift.startTime)}-${normalizeTime(shift.endTime)}`
  }))
)

const activeRuleId = computed(() => draft.value?.id || selectedId.value)
const locationPoint = computed(() => config.value.locationPoints?.[0] || {})
const wifiText = computed({
  get: () => (config.value.wifiConfigs || []).map((item) => item.ssid).filter(Boolean).join('\n'),
  set: (value: string) => {
    config.value.wifiConfigs = value.split('\n').filter(Boolean).map((ssid) => ({ ssid }))
  }
})

const toRulePayload = (rule: HrScheduleRule, ruleConfig: AttendanceRuleConfig) => ({
  ruleName: rule.ruleName,
  ruleType: rule.ruleType,
  ruleConfig: JSON.stringify(ruleConfig),
  description: rule.description || '',
  status: rule.status ?? 1
})

const loadAssignments = async (ruleId: number) => {
  try {
    assignments.value = await listHrScheduleRuleAssignments(ruleId)
  } catch {
    assignments.value = []
  }
}

const selectRule = (rule: HrScheduleRule, shouldLoadAssignments = true) => {
  selectedId.value = rule.id
  draft.value = { ...rule }
  config.value = parseConfig(rule.ruleConfig)
  if (shouldLoadAssignments) {
    void loadAssignments(rule.id)
  } else {
    listHrScheduleRuleAssignments(rule.id).then((items) => { assignments.value = items }).catch(() => { assignments.value = [] })
  }
}

const loadAll = async () => {
  loading.value = true
  try {
    const [ruleList, shiftList, days] = await Promise.all([
      listHrScheduleRules(),
      listHrShifts(),
      listWorkCalendarDays({ startDate: addDays(-7), endDate: addDays(14) })
    ])
    rules.value = ruleList
    shifts.value = shiftList
    calendarDays.value = days
    const firstRule = ruleList[0] || null
    if (firstRule) {
      selectRule(firstRule, false)
    } else {
      draft.value = createDraftRule(shiftList[0]?.id)
      config.value = defaultConfig(shiftList[0]?.id)
    }
  } catch (error) {
    toast.error(getErrorMessage(error, '加载考勤规则失败'))
  } finally {
    loading.value = false
  }
}

const updateLocationPoint = (patch: Record<string, unknown>) => {
  config.value.locationPoints = [{ ...locationPoint.value, ...patch }]
}

const toggleArrayValue = (key: 'workDays' | 'checkMethods', value: number | string) => {
  const current = Array.isArray(config.value[key]) ? [...(config.value[key] as Array<number | string>)] : []
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
  config.value = { ...config.value, [key]: next.sort() }
}

const handleSave = async () => {
  if (!draft.value?.ruleName.trim()) {
    toast.error('请输入规则名称')
    return
  }
  saving.value = true
  try {
    const payload = toRulePayload(draft.value, config.value)
    if (draft.value.id) {
      await updateHrScheduleRule(draft.value.id, payload)
    } else {
      const id = await createHrScheduleRule(payload)
      selectedId.value = id
    }
    toast.success('规则已保存')
    await loadAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存规则失败'))
  } finally {
    saving.value = false
  }
}

const handleDeleteRule = async () => {
  if (!draft.value?.id) return
  try {
    await deleteHrScheduleRule(draft.value.id)
    toast.success('规则已删除')
    selectedId.value = null
    draft.value = null
    await loadAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除规则失败'))
  }
}

const handleAddAssignment = async () => {
  if (!activeRuleId.value || !assignmentDraft.value.targetId) {
    toast.error('请输入目标ID')
    return
  }
  try {
    await createHrScheduleRuleAssignment(activeRuleId.value, {
      targetType: assignmentDraft.value.targetType,
      targetId: Number(assignmentDraft.value.targetId),
      effectiveStart: assignmentDraft.value.effectiveStart,
      status: 1
    })
    toast.success('适用范围已添加')
    assignmentDraft.value.targetId = ''
    await loadAssignments(activeRuleId.value)
  } catch (error) {
    toast.error(getErrorMessage(error, '添加适用范围失败'))
  }
}

const handleDeleteAssignment = async (id: number) => {
  try {
    await deleteHrScheduleRuleAssignment(id)
    toast.success('适用范围已删除')
    if (activeRuleId.value) await loadAssignments(activeRuleId.value)
  } catch (error) {
    toast.error(getErrorMessage(error, '删除适用范围失败'))
  }
}

const handleSaveCalendar = async () => {
  if (!calendarDraft.value.dayName.trim()) {
    toast.error('请输入日期名称')
    return
  }
  try {
    const existing = calendarDays.value.find((item) => item.calendarDate === calendarDraft.value.calendarDate)
    const payload = { ...calendarDraft.value, source: 'MANUAL', status: 1 }
    if (existing) {
      await updateWorkCalendarDay(existing.id, payload)
    } else {
      await createWorkCalendarDay(payload)
    }
    toast.success('企业日历已保存')
    calendarDays.value = await listWorkCalendarDays({ startDate: addDays(-7), endDate: addDays(14) })
  } catch (error) {
    toast.error(getErrorMessage(error, '保存企业日历失败'))
  }
}

const handleDeleteCalendar = async (id: number) => {
  try {
    await deleteWorkCalendarDay(id)
    toast.success('企业日历已删除')
    calendarDays.value = await listWorkCalendarDays({ startDate: addDays(-7), endDate: addDays(14) })
  } catch (error) {
    toast.error(getErrorMessage(error, '删除企业日历失败'))
  }
}

const createNewRule = () => {
  selectedId.value = null
  draft.value = createDraftRule(shifts.value[0]?.id)
  config.value = defaultConfig(shifts.value[0]?.id)
  assignments.value = []
}

onMounted(() => {
  config.value = defaultConfig()
  void loadAll()
})
</script>

<template>
  <div class="space-y-4">
    <div class="min-w-0">
      <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        <CalendarClock class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
        Attendance Rules
      </div>
      <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">考勤规则</h1>
    </div>

    <div class="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside class="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/90">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">规则组</div>
          <Button size="icon" variant="outline" title="新增规则" @click="createNewRule">
            <Plus class="h-[15px] w-[15px]" />
          </Button>
        </div>
        <div class="space-y-2 p-3">
          <div v-if="loading" class="rounded-lg border border-slate-200 px-3 py-8 text-center text-sm text-slate-500 dark:border-slate-800">加载中</div>
          <button
            v-for="rule in rules"
            :key="rule.id"
            type="button"
            class="w-full rounded-lg border px-3 py-3 text-left transition-colors"
            :class="selectedId === rule.id ? 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900'"
            @click="selectRule(rule)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-semibold">{{ rule.ruleName }}</span>
              <CheckCircle2 v-if="rule.status === 1" class="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              <span class="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{{ RULE_TYPE_LABEL[rule.ruleType] || rule.ruleType }}</span>
              <span class="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">ID {{ rule.id }}</span>
            </div>
          </button>
        </div>
      </aside>

      <main class="space-y-4">
        <div class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/90">
          <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            规则 {{ draft?.ruleName || '未命名' }}
          </span>
          <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            班次 {{ selectedShift ? `${normalizeTime(selectedShift.startTime)}-${normalizeTime(selectedShift.endTime)}` : '未选择' }}
          </span>
          <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            适用范围 {{ assignments.length }} 项
          </span>
          <div class="ml-auto flex flex-wrap gap-2">
            <Button v-if="draft?.id" variant="outline" size="sm" @click="handleDeleteRule">
              <Trash2 class="h-3.5 w-3.5" />
              删除
            </Button>
            <Button size="sm" :disabled="saving || !draft" @click="handleSave">
              <Save class="h-3.5 w-3.5" />
              {{ saving ? '保存中...' : '保存规则' }}
            </Button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button :variant="activeTab === 'rule' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'rule'">规则配置</Button>
          <Button :variant="activeTab === 'assignment' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'assignment'">适用范围</Button>
          <Button :variant="activeTab === 'calendar' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'calendar'">企业日历</Button>
        </div>

        <div v-if="activeTab === 'rule'" class="space-y-4">
          <Panel title="基础与班次">
            <template #icon><CalendarClock class="h-4 w-4 text-slate-500" /></template>
            <div class="grid gap-4 lg:grid-cols-3">
              <Input v-model="draft!.ruleName" label="规则名称" />
              <label class="space-y-2">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">规则类型</span>
                <Select v-model="draft!.ruleType" :options="ruleTypeOptions" />
              </label>
              <label class="space-y-2">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">绑定班次</span>
                <Select v-model="config.shiftId" :options="shiftOptions" placeholder="选择班次" />
              </label>
              <label class="space-y-2">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">启用规则</span>
                <Select v-model="draft!.status" :options="statusOptions" />
              </label>
              <Input v-model="draft!.description" label="备注" />
            </div>
            <div class="mt-4 flex flex-wrap gap-2">
              <Button
                v-for="day in WEEKDAYS"
                :key="day.value"
                type="button"
                size="sm"
                :variant="config.workDays?.includes(day.value) ? 'primary' : 'outline'"
                @click="toggleArrayValue('workDays', day.value)"
              >
                {{ day.label }}
              </Button>
            </div>
          </Panel>

          <div class="grid gap-4 xl:grid-cols-2">
            <Panel title="打卡方式与地点">
              <template #icon><MapPin class="h-4 w-4 text-slate-500" /></template>
              <div class="mb-4 flex flex-wrap gap-2">
                <Button
                  v-for="method in ['GPS', 'WIFI', 'FACE']"
                  :key="method"
                  type="button"
                  size="sm"
                  :variant="config.checkMethods?.includes(method) ? 'primary' : 'outline'"
                  @click="toggleArrayValue('checkMethods', method)"
                >
                  {{ method }}
                </Button>
              </div>
              <div class="grid gap-4 md:grid-cols-2">
                <Input label="地点名称" :model-value="String(locationPoint.name || '')" @update:model-value="updateLocationPoint({ name: $event })" />
                <Input v-model="config.radius" label="打卡半径(米)" type="number" />
                <Input label="纬度" type="number" :model-value="locationPoint.latitude == null ? '' : String(locationPoint.latitude)" @update:model-value="updateLocationPoint({ latitude: Number($event || 0) })" />
                <Input label="经度" type="number" :model-value="locationPoint.longitude == null ? '' : String(locationPoint.longitude)" @update:model-value="updateLocationPoint({ longitude: Number($event || 0) })" />
              </div>
              <div class="mt-4">
                <TextArea v-model="wifiText" label="Wi-Fi SSID（一行一个）" />
              </div>
            </Panel>

            <Panel title="异常与加班口径">
              <template #icon><Wifi class="h-4 w-4 text-slate-500" /></template>
              <div class="grid gap-4 md:grid-cols-2">
                <Input v-model="config.lateToleranceCount" label="每月迟到容忍次数" type="number" />
                <Input v-model="config.severeLateMinutes" label="严重迟到阈值(分钟)" type="number" />
                <Input v-model="config.absentMinutes" label="旷工阈值(分钟)" type="number" />
                <Input v-model="config.overtimeMinMinutes" label="加班最小时长(分钟)" type="number" />
                <label class="space-y-2">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">允许加班</span>
                  <Select v-model="config.overtimeEnabled" :options="boolOptions" />
                </label>
                <label class="space-y-2">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">拍照/人脸增强</span>
                  <Select v-model="config.photoRequired" :options="boolOptions" />
                </label>
              </div>
            </Panel>
          </div>
        </div>

        <Panel v-else-if="activeTab === 'assignment'" title="适用范围">
          <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
          <div class="grid gap-3 lg:grid-cols-[160px_1fr_180px_auto]">
            <Select v-model="assignmentDraft.targetType" :options="targetTypeOptions" />
            <Input v-model="assignmentDraft.targetId" placeholder="目标ID" />
            <Input v-model="assignmentDraft.effectiveStart" type="date" />
            <Button :disabled="!activeRuleId" @click="handleAddAssignment">
              <Plus class="h-3.5 w-3.5" />
              添加
            </Button>
          </div>
          <div class="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <DataTable :columns="assignmentColumns" :data="assignments" row-key="id">
              <template #cell-targetType="{ row }">
                <StatusBadge :label="TARGET_LABEL[row.targetType] || row.targetType" />
              </template>
              <template #cell-targetName="{ row }">
                <span class="font-medium">{{ row.targetName || row.targetId }}</span>
              </template>
              <template #cell-actions="{ row }">
                <div class="flex justify-end">
                  <Button variant="ghost" size="icon" @click="handleDeleteAssignment(row.id)">
                    <Trash2 class="h-[15px] w-[15px]" />
                  </Button>
                </div>
              </template>
            </DataTable>
          </div>
        </Panel>

        <Panel v-else title="企业日历">
          <template #icon><CalendarDays class="h-4 w-4 text-slate-500" /></template>
          <div class="grid gap-3 lg:grid-cols-[180px_180px_1fr_auto]">
            <Input v-model="calendarDraft.calendarDate" type="date" />
            <Select v-model="calendarDraft.dayType" :options="dayTypeOptions" />
            <Input v-model="calendarDraft.dayName" placeholder="日期名称" />
            <Button @click="handleSaveCalendar">
              <Save class="h-3.5 w-3.5" />
              保存
            </Button>
          </div>
          <div class="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <DataTable :columns="calendarColumns" :data="calendarDays" row-key="id">
              <template #cell-dayName="{ row }">
                {{ row.dayName || DAY_TYPE_LABEL[row.dayType] }}
              </template>
              <template #cell-dayType="{ row }">
                <StatusBadge :label="DAY_TYPE_LABEL[row.dayType] || row.dayType" tone="cyan" />
              </template>
              <template #cell-actions="{ row }">
                <div class="flex justify-end">
                  <Button variant="ghost" size="icon" @click="handleDeleteCalendar(row.id)">
                    <Trash2 class="h-[15px] w-[15px]" />
                  </Button>
                </div>
              </template>
            </DataTable>
          </div>
        </Panel>
      </main>
    </div>
  </div>
</template>
