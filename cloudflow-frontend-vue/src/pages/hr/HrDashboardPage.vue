<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  BadgeDollarSign,
  CalendarClock,
  ClipboardCheck,
  FileWarning,
  Landmark,
  RefreshCcw,
  ShieldCheck,
  UserRoundCheck,
  Users
} from 'lucide-vue-next'
import { Button, Panel, StatCard, StatusBadge } from '@/components/common'
import {
  type AttendanceSupplement,
  type EmployeeContract,
  type EmployeeSalary,
  type HrEmployee,
  listAttendanceSupplements,
  listEmployeeSalaries,
  listEmployees,
  listExpiringEmployeeContracts,
  listSalaryAdjustments,
  type SalaryAdjustment
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  employeeStatusLabel,
  formatCurrency,
  formatDate,
  normalizeRows,
  statusTone,
  todayValue
} from './hrUtils'

type ModuleEntry = {
  title: string
  hint: string
  path: string
  meta: string
  tone: 'cyan' | 'emerald' | 'amber' | 'slate'
  icon: unknown
}

const router = useRouter()
const toast = useToastStore()
const loading = ref(false)
const employees = ref<HrEmployee[]>([])
const expiringContracts = ref<EmployeeContract[]>([])
const employeeSalaries = ref<EmployeeSalary[]>([])
const salaryAdjustments = ref<SalaryAdjustment[]>([])
const supplements = ref<AttendanceSupplement[]>([])

const loadData = async () => {
  loading.value = true
  try {
    const [employeeRes, contractRes, salaryRes, adjustmentRes, supplementRes] = await Promise.allSettled([
      listEmployees(),
      listExpiringEmployeeContracts(30),
      listEmployeeSalaries(),
      listSalaryAdjustments({ pageNum: 1, pageSize: 20 }),
      listAttendanceSupplements({ pageNum: 1, pageSize: 20 })
    ])

    employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
    expiringContracts.value = contractRes.status === 'fulfilled' ? normalizeRows<EmployeeContract>(contractRes.value) : []
    employeeSalaries.value = salaryRes.status === 'fulfilled' ? normalizeRows<EmployeeSalary>(salaryRes.value) : []
    salaryAdjustments.value = adjustmentRes.status === 'fulfilled' ? normalizeRows<SalaryAdjustment>(adjustmentRes.value) : []
    supplements.value = supplementRes.status === 'fulfilled' ? normalizeRows<AttendanceSupplement>(supplementRes.value) : []
  } catch (error) {
    toast.error(getErrorMessage(error, 'HR 看板加载失败'))
  } finally {
    loading.value = false
  }
}

const summary = computed(() => {
  const activeEmployees = employees.value.filter((item) => ['PROBATION', 'REGULAR'].includes(String(item.employeeStatus).toUpperCase()))
  const probation = employees.value.filter((item) => item.employeeStatus === 'PROBATION')
  const pendingAdjustments = salaryAdjustments.value.filter((item) => !['EFFECTIVE', 'APPROVED', 'REJECTED'].includes(String(item.status || '').toUpperCase()))
  const pendingSupplements = supplements.value.filter((item) => !['APPROVED', 'REJECTED'].includes(String(item.status || '').toUpperCase()))
  const payrollTotal = employeeSalaries.value.reduce((total, item) => total + Number(item.totalSalary || 0), 0)
  return {
    activeEmployees: activeEmployees.length,
    probation: probation.length,
    expiringContracts: expiringContracts.value.length,
    pendingAdjustments: pendingAdjustments.length,
    pendingSupplements: pendingSupplements.length,
    payrollTotal
  }
})

const moduleEntries = computed<ModuleEntry[]>(() => [
  {
    title: '员工档案',
    hint: '主档、合同、证件、联系人与薪酬资料',
    path: '/hr/employees',
    meta: `${employees.value.length} 人`,
    tone: 'cyan',
    icon: Users
  },
  {
    title: '薪酬管理',
    hint: '薪资结构、现薪、调薪、社保与个税',
    path: '/hr/salary',
    meta: formatCurrency(summary.value.payrollTotal),
    tone: 'amber',
    icon: Landmark
  },
  {
    title: '考勤规则',
    hint: '规则、适用范围与企业日历',
    path: '/hr/attendance/rule',
    meta: '规则配置',
    tone: 'emerald',
    icon: ClipboardCheck
  },
  {
    title: '补卡申请',
    hint: '异常打卡补录与审批状态',
    path: '/hr/attendance/supplement',
    meta: `${summary.value.pendingSupplements} 待处理`,
    tone: 'slate',
    icon: CalendarClock
  }
])

const recentEmployees = computed(() =>
  [...employees.value]
    .sort((a, b) => String(b.updateTime || b.createTime || b.hireDate || '').localeCompare(String(a.updateTime || a.createTime || a.hireDate || '')))
    .slice(0, 6)
)

const attentionItems = computed(() => [
  ...expiringContracts.value.slice(0, 4).map((item) => ({
    title: `${item.contractNo || '合同'} 即将到期`,
    helper: `${item.employeeId} · ${formatDate(item.endDate)}`,
    tone: 'yellow' as const
  })),
  ...salaryAdjustments.value.slice(0, 4).map((item) => ({
    title: `${item.employeeName || item.employeeId} 调薪申请`,
    helper: `${item.applicationNo || '未编号'} · ${formatCurrency(item.afterTotal)}`,
    tone: statusTone(item.status)
  }))
].slice(0, 6))

onMounted(() => {
  void loadData()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <ShieldCheck class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          HR Command Center
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">HR 看板</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ todayValue() }} · 员工、薪酬、合同与考勤待办</p>
      </div>
      <Button variant="outline" :disabled="loading" @click="loadData">
        <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard title="在册员工" :value="summary.activeEmployees" description="试用与正式员工">
        <template #icon><Users class="h-9 w-9 rounded-xl bg-cyan-50 p-2 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-200" /></template>
      </StatCard>
      <StatCard title="试用期" :value="summary.probation" description="需关注转正节奏">
        <template #icon><UserRoundCheck class="h-9 w-9 rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-200" /></template>
      </StatCard>
      <StatCard title="合同到期" :value="summary.expiringContracts" description="30 天内到期合同">
        <template #icon><FileWarning class="h-9 w-9 rounded-xl bg-rose-50 p-2 text-rose-600 dark:bg-rose-950/40 dark:text-rose-200" /></template>
      </StatCard>
      <StatCard title="待调薪" :value="summary.pendingAdjustments" description="待推进调薪申请">
        <template #icon><BadgeDollarSign class="h-9 w-9 rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200" /></template>
      </StatCard>
    </div>

    <div class="grid gap-4 lg:grid-cols-4">
      <button
        v-for="entry in moduleEntries"
        :key="entry.path"
        type="button"
        class="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-card-hover dark:border-slate-800 dark:bg-slate-950/80 dark:hover:border-cyan-900"
        @click="router.push(entry.path)"
      >
        <div class="flex items-start gap-3">
          <component
            :is="entry.icon"
            class="h-10 w-10 rounded-xl p-2"
            :class="{
              'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-200': entry.tone === 'cyan',
              'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200': entry.tone === 'emerald',
              'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-200': entry.tone === 'amber',
              'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200': entry.tone === 'slate'
            }"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-slate-900 dark:text-slate-100">{{ entry.title }}</span>
              <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">{{ entry.meta }}</span>
            </div>
            <p class="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{{ entry.hint }}</p>
          </div>
        </div>
      </button>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <Panel title="近期员工动态">
        <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
        <div class="divide-y divide-slate-100 dark:divide-slate-800">
          <button
            v-for="employee in recentEmployees"
            :key="employee.id"
            type="button"
            class="flex w-full items-center justify-between gap-4 px-1 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50"
            @click="router.push('/hr/employees')"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{{ employee.name }}</span>
              <span class="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{{ employee.employeeNo }} · {{ employee.deptName || '未分配部门' }} · {{ formatDate(employee.hireDate || employee.createTime) }}</span>
            </span>
            <StatusBadge :label="employeeStatusLabel[employee.employeeStatus] || employee.employeeStatus" :tone="statusTone(employee.employeeStatus)" />
          </button>
          <div v-if="!recentEmployees.length" class="py-10 text-center text-sm text-slate-500">暂无员工动态</div>
        </div>
      </Panel>

      <Panel title="待处理提醒">
        <template #icon><FileWarning class="h-4 w-4 text-slate-500" /></template>
        <div class="space-y-2">
          <div
            v-for="item in attentionItems"
            :key="`${item.title}-${item.helper}`"
            class="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{{ item.title }}</div>
                <div class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{{ item.helper }}</div>
              </div>
              <StatusBadge label="关注" :tone="item.tone" />
            </div>
          </div>
          <div v-if="!attentionItems.length" class="py-10 text-center text-sm text-slate-500">暂无待处理提醒</div>
        </div>
      </Panel>
    </div>
  </div>
</template>
