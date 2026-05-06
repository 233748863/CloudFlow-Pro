<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, BarChart3, Download, PlayCircle, RefreshCcw, Users } from 'lucide-vue-next'
import {
  Button,
  DataTable,
  Pagination,
  Panel,
  Select,
  StatusBadge,
  type Column,
  type SelectOption
} from '@/components/common'
import {
  type DeptTreeNode,
  type HrAttendanceAnomaly,
  type HrAttendanceMonthly,
  type HrAttendanceRate,
  type HrEmployee,
  exportHrAttendanceReport,
  generateHrAttendanceMonthly,
  generateHrEmployeeAttendanceMonthly,
  getDeptTreeOptions,
  getHrAttendanceRate,
  listEmployees,
  listHrAttendanceAnomalies,
  listHrAttendanceMonthly
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { buildEmployeeLabel, flattenDeptTree, formatNumber, normalizeRows, statusTone } from './hrUtils'

const toast = useToastStore()
const loading = ref(false)
const anomalyLoading = ref(false)
const running = ref(false)
const employees = ref<HrEmployee[]>([])
const depts = ref<DeptTreeNode[]>([])
const monthlyRows = ref<HrAttendanceMonthly[]>([])
const anomalyRows = ref<HrAttendanceAnomaly[]>([])
const rate = ref<HrAttendanceRate | null>(null)
const anomalyTotal = ref(0)
const anomalyPage = ref(1)
const anomalyPageSize = ref(10)
const selectedEmployeeId = ref<string | number | null>('')
const selectedDeptId = ref<string | number | null>('')
const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)
const statusFilter = ref('')
const anomalyTypeFilter = ref('')

const monthColumns: Column<HrAttendanceMonthly>[] = [
  { key: 'employeeName', label: '员工' },
  { key: 'deptName', label: '部门' },
  { key: 'workDays', label: '应出勤' },
  { key: 'actualDays', label: '实际' },
  { key: 'attendanceRate', label: '出勤率' },
  { key: 'lateTimes', label: '迟到' },
  { key: 'missingTimes', label: '缺卡' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const anomalyColumns: Column<HrAttendanceAnomaly>[] = [
  { key: 'employeeName', label: '员工' },
  { key: 'deptName', label: '部门' },
  { key: 'attendanceDate', label: '日期' },
  { key: 'anomalyType', label: '异常' },
  { key: 'checkTime', label: '打卡时间' },
  { key: 'expectedTime', label: '应打卡' },
  { key: 'description', label: '说明' }
]

const yearOptions = computed<SelectOption[]>(() => {
  const current = new Date().getFullYear()
  return [current - 1, current, current + 1].map((year) => ({ value: year, label: String(year) }))
})
const monthOptions = computed<SelectOption[]>(() =>
  Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1} 月` }))
)
const employeeOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部员工' },
  ...employees.value.map((item) => ({ value: item.id, label: buildEmployeeLabel(item) }))
])
const deptOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部部门' },
  ...flattenDeptTree(depts.value).map((item) => ({ value: item.deptId, label: item.deptName }))
])
const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'CONFIRMED', label: '已确认' }
]
const anomalyTypeOptions: SelectOption[] = [
  { value: '', label: '全部异常' },
  { value: 'LATE', label: '迟到' },
  { value: 'EARLY', label: '早退' },
  { value: 'MISSING', label: '缺卡' },
  { value: 'ABSENT', label: '旷工' }
]

const summary = computed(() => ({
  employees: rate.value?.totalEmployees ?? monthlyRows.value.length,
  attendanceRate: rate.value?.averageAttendanceRate ?? average(monthlyRows.value.map((item) => Number(item.attendanceRate || 0))),
  lateTimes: rate.value?.totalLateTimes ?? sum(monthlyRows.value.map((item) => item.lateTimes)),
  missingTimes: rate.value?.totalMissingTimes ?? sum(monthlyRows.value.map((item) => item.missingTimes))
}))

const selectedEmployee = computed(() =>
  employees.value.find((item) => item.id === Number(selectedEmployeeId.value)) || null
)

const sum = (values: Array<number | undefined>) => values.reduce((total = 0, value) => total + Number(value || 0), 0)
const average = (values: number[]) => {
  const valid = values.filter((value) => Number.isFinite(value))
  if (!valid.length) return 0
  return valid.reduce((total, value) => total + value, 0) / valid.length
}
const normalizeId = (value: string | number | null) => value ? Number(value) : undefined
const percentLabel = (value?: number | string | null) => `${formatNumber(Number(value || 0))}%`
const formatDateTime = (value?: string | null) => value ? String(value).replace('T', ' ').slice(0, 16) : '-'
const monthStatusLabel = (row: HrAttendanceMonthly) => row.statusName || (row.status === 'CONFIRMED' ? '已确认' : row.status === 'DRAFT' ? '草稿' : row.status || '-')
const anomalyLabel = (row: HrAttendanceAnomaly) =>
  row.anomalyTypeName || anomalyTypeOptions.find((item) => item.value === row.anomalyType)?.label || row.anomalyType || '-'
const anomalyTone = (type?: string) => {
  if (type === 'ABSENT') return 'red'
  if (type === 'MISSING') return 'yellow'
  return 'cyan'
}

const loadOptions = async () => {
  const [employeeRes, deptRes] = await Promise.allSettled([listEmployees({ pageNum: 1, pageSize: 500 }), getDeptTreeOptions()])
  employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
  depts.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
}

const loadMonthly = async () => {
  monthlyRows.value = normalizeRows(await listHrAttendanceMonthly({
    employeeId: normalizeId(selectedEmployeeId.value),
    deptId: normalizeId(selectedDeptId.value),
    year: Number(selectedYear.value),
    month: Number(selectedMonth.value),
    status: statusFilter.value || undefined,
    pageNum: 1,
    pageSize: 300
  }))
}

const loadRate = async () => {
  rate.value = await getHrAttendanceRate({
    deptId: normalizeId(selectedDeptId.value),
    year: Number(selectedYear.value),
    month: Number(selectedMonth.value)
  })
}

const loadAnomalies = async () => {
  anomalyLoading.value = true
  try {
    const page = await listHrAttendanceAnomalies({
      employeeId: normalizeId(selectedEmployeeId.value),
      deptId: normalizeId(selectedDeptId.value),
      anomalyType: anomalyTypeFilter.value || undefined,
      startDate: `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-01`,
      endDate: `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-31`,
      pageNum: anomalyPage.value,
      pageSize: anomalyPageSize.value
    })
    anomalyRows.value = normalizeRows<HrAttendanceAnomaly>(page)
    anomalyTotal.value = Number(page.total || anomalyRows.value.length)
  } catch (error) {
    toast.error(getErrorMessage(error, '异常考勤加载失败'))
  } finally {
    anomalyLoading.value = false
  }
}

const loadData = async () => {
  loading.value = true
  try {
    await Promise.all([loadMonthly(), loadRate(), loadAnomalies()])
  } catch (error) {
    toast.error(getErrorMessage(error, '考勤统计加载失败'))
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  selectedEmployeeId.value = ''
  selectedDeptId.value = ''
  statusFilter.value = ''
  anomalyTypeFilter.value = ''
  anomalyPage.value = 1
  void loadData()
}

const runGenerate = async (single = false) => {
  running.value = true
  try {
    if (single) {
      if (!selectedEmployee.value) throw new Error('请选择员工')
      await generateHrEmployeeAttendanceMonthly(selectedEmployee.value.id, Number(selectedYear.value), Number(selectedMonth.value))
    } else {
      await generateHrAttendanceMonthly(Number(selectedYear.value), Number(selectedMonth.value))
    }
    toast.success('月度考勤汇总已生成')
    await loadData()
  } catch (error) {
    toast.error(getErrorMessage(error, '生成月度汇总失败'))
  } finally {
    running.value = false
  }
}

const runExport = async (format: 'EXCEL' | 'PDF') => {
  running.value = true
  try {
    const fileUrl = await exportHrAttendanceReport({
      deptId: normalizeId(selectedDeptId.value),
      year: Number(selectedYear.value),
      month: Number(selectedMonth.value),
      format
    })
    toast.success(fileUrl ? `报表已生成：${fileUrl}` : '报表已生成')
  } catch (error) {
    toast.error(getErrorMessage(error, '导出报表失败'))
  } finally {
    running.value = false
  }
}

onMounted(async () => {
  await loadOptions()
  await loadData()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <BarChart3 class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Attendance Statistics
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">考勤统计</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="loadData">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新
        </Button>
        <Button variant="outline" :disabled="running" @click="runExport('EXCEL')"><Download class="h-4 w-4" />导出 Excel</Button>
        <Button :disabled="running" @click="runGenerate(false)"><PlayCircle class="h-4 w-4" />生成月报</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">统计人数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.employees) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">平均出勤率</div><div class="mt-2 text-2xl font-semibold">{{ percentLabel(summary.attendanceRate) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">迟到次数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.lateTimes) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">缺卡次数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.missingTimes) }}</div></div>
    </div>

    <Panel title="筛选与动作">
      <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 md:grid-cols-6">
        <label class="space-y-2"><span class="text-sm font-medium">年份</span><Select v-model="selectedYear" :options="yearOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">月份</span><Select v-model="selectedMonth" :options="monthOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">部门</span><Select v-model="selectedDeptId" :options="deptOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="selectedEmployeeId" :options="employeeOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="statusFilter" :options="statusOptions" /></label>
        <div class="flex items-end gap-2">
          <Button class="flex-1" @click="anomalyPage = 1; loadData()">查询</Button>
          <Button variant="outline" @click="resetFilters">重置</Button>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" :disabled="running || !selectedEmployee" @click="runGenerate(true)">生成当前员工</Button>
        <Button size="sm" variant="outline" :disabled="running" @click="runExport('PDF')">导出 PDF</Button>
      </div>
    </Panel>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="月度汇总">
        <template #icon><BarChart3 class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="monthColumns" :data="monthlyRows" :loading="loading" row-key="id">
          <template #cell-employeeName="{ row }">
            <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.employeeName || row.employeeId }}</div>
            <div class="text-xs text-slate-500">{{ row.employeeNo || '-' }}</div>
          </template>
          <template #cell-workDays="{ row }">{{ formatNumber(row.workDays) }}</template>
          <template #cell-actualDays="{ row }">{{ formatNumber(row.actualDays) }}</template>
          <template #cell-attendanceRate="{ row }"><StatusBadge :label="percentLabel(row.attendanceRate)" :tone="Number(row.attendanceRate || 0) >= 95 ? 'green' : 'yellow'" /></template>
          <template #cell-lateTimes="{ row }">{{ formatNumber(row.lateTimes) }}</template>
          <template #cell-missingTimes="{ row }">{{ formatNumber(row.missingTimes) }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="monthStatusLabel(row)" :tone="statusTone(row.status)" /></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end">
              <Button size="sm" variant="outline" @click="selectedEmployeeId = row.employeeId; runGenerate(true)">重算</Button>
            </div>
          </template>
        </DataTable>
      </Panel>

      <Panel title="出勤率分析">
        <template #icon><BarChart3 class="h-4 w-4 text-slate-500" /></template>
        <div class="space-y-3">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ rate?.deptName || '全部部门' }}</div>
            <div class="mt-1 text-xs text-slate-500">{{ selectedYear }} 年 {{ selectedMonth }} 月</div>
          </div>
          <div class="grid gap-3">
            <div class="card p-3"><div class="text-xs text-slate-500">应出勤总天数</div><div class="mt-1 text-lg font-semibold">{{ formatNumber(rate?.totalWorkDays) }}</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">实际出勤总天数</div><div class="mt-1 text-lg font-semibold">{{ formatNumber(rate?.totalActualDays) }}</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">旷工天数</div><div class="mt-1 text-lg font-semibold">{{ formatNumber(rate?.totalAbsentDays) }}</div></div>
          </div>
        </div>
      </Panel>
    </div>

    <Panel title="异常考勤">
      <template #icon><AlertTriangle class="h-4 w-4 text-slate-500" /></template>
      <div class="mb-3 grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
        <label class="space-y-2"><span class="text-sm font-medium">异常类型</span><Select v-model="anomalyTypeFilter" :options="anomalyTypeOptions" /></label>
        <div class="flex items-end"><Button variant="outline" @click="anomalyPage = 1; loadAnomalies()">筛选异常</Button></div>
      </div>
      <DataTable :columns="anomalyColumns" :data="anomalyRows" :loading="anomalyLoading" :row-key="(row) => `${row.employeeId}-${row.attendanceDate}-${row.anomalyType}-${row.checkTime || ''}`">
        <template #cell-employeeName="{ row }">
          <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.employeeName || row.employeeId }}</div>
          <div class="text-xs text-slate-500">{{ row.employeeNo || '-' }}</div>
        </template>
        <template #cell-anomalyType="{ row }"><StatusBadge :label="anomalyLabel(row)" :tone="anomalyTone(row.anomalyType)" /></template>
        <template #cell-checkTime="{ row }">{{ formatDateTime(row.checkTime) }}</template>
        <template #cell-expectedTime="{ row }">{{ formatDateTime(row.expectedTime) }}</template>
        <template #cell-description="{ row }"><span class="text-slate-500">{{ row.description || '-' }}</span></template>
      </DataTable>
      <Pagination v-model:page="anomalyPage" v-model:page-size="anomalyPageSize" :total="anomalyTotal" />
    </Panel>
  </div>
</template>
