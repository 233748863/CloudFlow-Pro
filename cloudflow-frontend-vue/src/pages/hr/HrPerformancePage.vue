<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { GitBranch, Plus, RefreshCcw, Save, Send, Target, TrendingUp, Users } from 'lucide-vue-next'
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
  type DeptTreeNode,
  type PerformanceAssignment,
  type PerformanceObjective,
  type PerformanceOverview,
  createPerformanceObjective,
  createPerformanceSalaryAdjustment,
  getDeptTreeOptions,
  getPerformanceObjectiveTree,
  getPerformanceOverview,
  listEmployees,
  listPerformanceObjectives,
  savePerformanceAssignmentChildren,
  submitPerformancePlan,
  submitPerformanceResult,
  updatePerformanceResult,
  type HrEmployee
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { flattenDeptTree, formatDate, formatNumber, normalizeRows, statusTone, todayValue, workflowStatusLabel } from './hrUtils'

type DialogMode = 'objective' | 'split' | 'result' | 'salary' | null
type TreeRow = PerformanceAssignment & { depth: number }

const toast = useToastStore()
const loading = ref(false)
const detailLoading = ref(false)
const submitting = ref(false)
const dialogMode = ref<DialogMode>(null)
const objectives = ref<PerformanceObjective[]>([])
const overview = ref<PerformanceOverview | null>(null)
const currentObjective = ref<PerformanceObjective | null>(null)
const selectedAssignment = ref<PerformanceAssignment | null>(null)
const employees = ref<HrEmployee[]>([])
const deptOptions = ref<DeptTreeNode[]>([])

const objectiveForm = ref({
  cycleName: `${new Date().getFullYear()} 年度`,
  cycleStartDate: `${new Date().getFullYear()}-01-01`,
  cycleEndDate: `${new Date().getFullYear()}-12-31`,
  objectiveName: '',
  totalTargetAmount: '0',
  scoreCap: '120',
  categoryCode: 'CORE',
  categoryName: '核心指标',
  metricCode: 'FINISH_COUNT',
  metricName: '完成数量',
  metricUnit: '件',
  metricWeight: '100',
  deptId: '',
  deptTargetAmount: '0'
})

const splitForm = ref({
  assigneeType: 'EMPLOYEE',
  assigneeId: '',
  assigneeName: '',
  targetAmount: '0',
  metricWeight: '100',
  locked: false
})

const resultForm = ref({
  actualAmount: '0'
})

const salaryForm = ref({
  employeeId: '',
  adjustmentReason: '',
  minScore: '80',
  afterSalaryData: '{}',
  afterTotal: '0',
  effectiveDate: todayValue()
})

const objectiveColumns: Column<PerformanceObjective>[] = [
  { key: 'objectiveNo', label: '目标编号' },
  { key: 'objectiveName', label: '目标名称' },
  { key: 'cycleName', label: '周期' },
  { key: 'totalTargetAmount', label: '目标值' },
  { key: 'completionRate', label: '完成率' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const assignmentColumns: Column<TreeRow>[] = [
  { key: 'assigneeName', label: '分解对象' },
  { key: 'metricName', label: '指标' },
  { key: 'targetAmount', label: '目标值' },
  { key: 'actualAmount', label: '实际值' },
  { key: 'completionRate', label: '完成率' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const employeeOptions = computed<SelectOption[]>(() =>
  employees.value.map((item) => ({ value: item.id, label: `${item.name} / ${item.employeeNo}` }))
)

const deptSelectOptions = computed<SelectOption[]>(() =>
  flattenDeptTree(deptOptions.value).map((item) => ({ value: item.deptId, label: item.deptName }))
)

const assigneeOptions = computed<SelectOption[]>(() =>
  splitForm.value.assigneeType === 'DEPT' ? deptSelectOptions.value : employeeOptions.value
)

const assigneeTypeOptions: SelectOption[] = [
  { value: 'EMPLOYEE', label: '员工' },
  { value: 'DEPT', label: '部门' }
]

const boolOptions: SelectOption[] = [
  { value: true, label: '锁定' },
  { value: false, label: '可填报' }
]

const overviewStats = computed(() => ({
  total: Number(overview.value?.objectiveCount ?? objectives.value.length ?? 0),
  draft: Number(overview.value?.draftCount ?? 0),
  running: Number(overview.value?.runningCount ?? overview.value?.activeObjectiveCount ?? 0),
  completed: Number(overview.value?.completedCount ?? overview.value?.completedObjectiveCount ?? 0)
}))

const treeRows = computed<TreeRow[]>(() => {
  const walk = (items: PerformanceAssignment[] = [], depth = 0): TreeRow[] =>
    items.flatMap((item) => [{ ...item, depth }, ...walk(item.children || [], depth + 1)])
  return walk(currentObjective.value?.assignments || [])
})

const statusLabel = (value?: string) => workflowStatusLabel[value || ''] || value || '-'
const percentLabel = (value?: number | string | null) => {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? `${formatNumber(amount)}%` : '-'
}

const loadOptions = async () => {
  const [employeeRes, deptRes] = await Promise.allSettled([listEmployees(), getDeptTreeOptions()])
  employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
  deptOptions.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
}

const loadData = async (preserveId?: number) => {
  loading.value = true
  try {
    const [overviewRes, listRes] = await Promise.allSettled([
      getPerformanceOverview(),
      listPerformanceObjectives({ pageNum: 1, pageSize: 200 })
    ])
    overview.value = overviewRes.status === 'fulfilled' ? overviewRes.value : null
    objectives.value = listRes.status === 'fulfilled' ? normalizeRows<PerformanceObjective>(listRes.value) : []
    const nextId = preserveId || currentObjective.value?.id || objectives.value[0]?.id
    if (nextId) await loadObjective(nextId)
  } catch (error) {
    toast.error(getErrorMessage(error, '绩效数据加载失败'))
  } finally {
    loading.value = false
  }
}

const loadObjective = async (id: number) => {
  detailLoading.value = true
  try {
    currentObjective.value = await getPerformanceObjectiveTree(id)
    selectedAssignment.value = currentObjective.value.assignments?.[0] || null
  } catch (error) {
    toast.error(getErrorMessage(error, '绩效目标详情加载失败'))
  } finally {
    detailLoading.value = false
  }
}

const openObjectiveDialog = () => {
  objectiveForm.value = {
    cycleName: `${new Date().getFullYear()} 年度`,
    cycleStartDate: `${new Date().getFullYear()}-01-01`,
    cycleEndDate: `${new Date().getFullYear()}-12-31`,
    objectiveName: '',
    totalTargetAmount: '0',
    scoreCap: '120',
    categoryCode: 'CORE',
    categoryName: '核心指标',
    metricCode: 'FINISH_COUNT',
    metricName: '完成数量',
    metricUnit: '件',
    metricWeight: '100',
    deptId: String(deptSelectOptions.value[0]?.value || ''),
    deptTargetAmount: '0'
  }
  dialogMode.value = 'objective'
}

const openSplitDialog = (row?: PerformanceAssignment) => {
  selectedAssignment.value = row || selectedAssignment.value
  splitForm.value = {
    assigneeType: 'EMPLOYEE',
    assigneeId: String(employeeOptions.value[0]?.value || ''),
    assigneeName: '',
    targetAmount: String(selectedAssignment.value?.targetAmount || 0),
    metricWeight: '100',
    locked: false
  }
  dialogMode.value = 'split'
}

const openResultDialog = (row: PerformanceAssignment) => {
  selectedAssignment.value = row
  resultForm.value.actualAmount = String(row.actualAmount || '')
  dialogMode.value = 'result'
}

const openSalaryDialog = () => {
  salaryForm.value = {
    employeeId: String(employeeOptions.value[0]?.value || ''),
    adjustmentReason: '绩效结果调薪',
    minScore: '80',
    afterSalaryData: '{}',
    afterTotal: '0',
    effectiveDate: todayValue()
  }
  dialogMode.value = 'salary'
}

const handleSave = async () => {
  submitting.value = true
  try {
    if (dialogMode.value === 'objective') {
      const id = await createPerformanceObjective({
        cycleName: objectiveForm.value.cycleName,
        cycleStartDate: objectiveForm.value.cycleStartDate,
        cycleEndDate: objectiveForm.value.cycleEndDate,
        objectiveName: objectiveForm.value.objectiveName,
        totalTargetAmount: Number(objectiveForm.value.totalTargetAmount || 0),
        scoreCap: Number(objectiveForm.value.scoreCap || 120),
        categoryCodes: [objectiveForm.value.categoryCode],
        categoryDefinitions: [{ categoryCode: objectiveForm.value.categoryCode, categoryName: objectiveForm.value.categoryName }],
        metrics: [{
          metricCode: objectiveForm.value.metricCode,
          metricName: objectiveForm.value.metricName,
          metricUnit: objectiveForm.value.metricUnit,
          valueType: 'DECIMAL',
          precision: 2,
          metricWeight: Number(objectiveForm.value.metricWeight || 100)
        }],
        departmentAssignments: [{
          deptId: Number(objectiveForm.value.deptId),
          targetAmount: Number(objectiveForm.value.deptTargetAmount || 0)
        }]
      })
      await loadData(id)
    } else if (dialogMode.value === 'split' && selectedAssignment.value) {
      const matched = assigneeOptions.value.find((item) => item.value === Number(splitForm.value.assigneeId))
      await savePerformanceAssignmentChildren(selectedAssignment.value.id, {
        children: [{
          assigneeType: splitForm.value.assigneeType,
          assigneeId: Number(splitForm.value.assigneeId),
          assigneeName: splitForm.value.assigneeName || matched?.label,
          categoryCode: selectedAssignment.value.categoryCode,
          categoryName: selectedAssignment.value.categoryName,
          metricCode: selectedAssignment.value.metricCode,
          metricName: selectedAssignment.value.metricName,
          metricUnit: selectedAssignment.value.metricUnit,
          metricWeight: Number(splitForm.value.metricWeight || 100),
          targetAmount: Number(splitForm.value.targetAmount || 0),
          quotaSource: splitForm.value.locked ? 'MANAGER' : 'DEPT_OWNER',
          locked: splitForm.value.locked
        }]
      })
      await loadData(currentObjective.value?.id)
    } else if (dialogMode.value === 'result' && selectedAssignment.value) {
      await updatePerformanceResult({
        assignmentId: selectedAssignment.value.id,
        actualAmount: Number(resultForm.value.actualAmount || 0)
      })
      await loadData(currentObjective.value?.id)
    } else if (dialogMode.value === 'salary' && currentObjective.value) {
      await createPerformanceSalaryAdjustment(currentObjective.value.id, {
        employeeId: Number(salaryForm.value.employeeId),
        adjustmentReason: salaryForm.value.adjustmentReason,
        minScore: Number(salaryForm.value.minScore || 0),
        afterSalaryData: salaryForm.value.afterSalaryData,
        afterTotal: Number(salaryForm.value.afterTotal || 0),
        effectiveDate: salaryForm.value.effectiveDate
      })
    }
    dialogMode.value = null
    toast.success('保存成功')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    submitting.value = false
  }
}

const runAction = async (action: () => Promise<unknown>, message: string) => {
  submitting.value = true
  try {
    await action()
    toast.success(message)
    await loadData(currentObjective.value?.id)
  } catch (error) {
    toast.error(getErrorMessage(error, '操作失败'))
  } finally {
    submitting.value = false
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
          <Target class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Performance Center
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">绩效管理</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="loadData()"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="openObjectiveDialog"><Plus class="h-4 w-4" />新建目标</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">目标总数</div><div class="mt-2 text-2xl font-semibold">{{ overviewStats.total }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">草稿</div><div class="mt-2 text-2xl font-semibold">{{ overviewStats.draft }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">执行中</div><div class="mt-2 text-2xl font-semibold">{{ overviewStats.running }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">已完成</div><div class="mt-2 text-2xl font-semibold">{{ overviewStats.completed }}</div></div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <Panel title="绩效目标">
        <template #icon><TrendingUp class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="objectiveColumns" :data="objectives" :loading="loading" row-key="id">
          <template #cell-objectiveName="{ row }">
            <button type="button" class="text-left" @click="loadObjective(row.id)">
              <div class="font-semibold">{{ row.objectiveName }}</div>
              <div class="text-xs text-slate-500">{{ formatDate(row.cycleStartDate) }} ~ {{ formatDate(row.cycleEndDate) }}</div>
            </button>
          </template>
          <template #cell-totalTargetAmount="{ row }">{{ formatNumber(row.totalTargetAmount) }}</template>
          <template #cell-completionRate="{ row }">{{ percentLabel(row.completionRate) }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" /></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="sm" :variant="currentObjective?.id === row.id ? 'primary' : 'outline'" @click="loadObjective(row.id)">详情</Button>
              <Button size="icon" variant="ghost" @click="runAction(() => submitPerformancePlan(row.id), '计划已提交')"><Send class="h-4 w-4" /></Button>
            </div>
          </template>
        </DataTable>
      </Panel>

      <Panel title="目标工作区">
        <template #icon><GitBranch class="h-4 w-4 text-slate-500" /></template>
        <div v-if="currentObjective" class="space-y-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ currentObjective.objectiveName }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ currentObjective.objectiveNo || '-' }} · {{ currentObjective.cycleName }}</div>
              </div>
              <StatusBadge :label="statusLabel(currentObjective.status)" :tone="statusTone(currentObjective.status)" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="card p-3"><div class="text-xs text-slate-500">目标</div><div class="mt-1 text-lg font-semibold">{{ formatNumber(currentObjective.totalTargetAmount) }}</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">实际</div><div class="mt-1 text-lg font-semibold">{{ formatNumber(currentObjective.actualAmount) }}</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">得分</div><div class="mt-1 text-lg font-semibold">{{ formatNumber(currentObjective.score) }}</div></div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" @click="openSplitDialog()"><Users class="h-3.5 w-3.5" />分解</Button>
            <Button size="sm" variant="outline" @click="runAction(() => submitPerformanceResult(currentObjective!.id), '结果已提交')">提交结果</Button>
            <Button size="sm" @click="openSalaryDialog">绩效调薪</Button>
          </div>
        </div>
        <div v-else class="py-12 text-center text-sm text-slate-500">请选择绩效目标</div>
      </Panel>
    </div>

    <Panel title="目标分解与结果">
      <template #icon><GitBranch class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="assignmentColumns" :data="treeRows" :loading="detailLoading" row-key="id">
        <template #cell-assigneeName="{ row }"><span :style="{ paddingLeft: `${row.depth * 18}px` }">{{ row.assigneeName || row.assigneeId || '-' }}</span></template>
        <template #cell-metricName="{ row }">{{ row.categoryName || '-' }}<div class="text-xs text-slate-500">{{ row.metricName || row.metricCode || '-' }}</div></template>
        <template #cell-targetAmount="{ row }">{{ formatNumber(row.targetAmount) }} {{ row.metricUnit || '' }}</template>
        <template #cell-actualAmount="{ row }">{{ formatNumber(row.actualAmount) }} {{ row.metricUnit || '' }}</template>
        <template #cell-completionRate="{ row }">{{ percentLabel(row.completionRate) }}</template>
        <template #cell-status="{ row }"><StatusBadge :label="row.status || (row.locked ? 'MANAGER' : 'OPEN')" :tone="statusTone(row.status || 'ACTIVE')" /></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="sm" variant="outline" @click="openSplitDialog(row)">分解</Button>
            <Button size="sm" @click="openResultDialog(row)">填报</Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <BaseDialog :show="Boolean(dialogMode)" title="绩效操作" width="wide" @close="dialogMode = null">
      <div v-if="dialogMode === 'objective'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="objectiveForm.objectiveName" label="目标名称" required />
        <Input v-model="objectiveForm.cycleName" label="周期名称" required />
        <Input v-model="objectiveForm.cycleStartDate" label="开始日期" type="date" />
        <Input v-model="objectiveForm.cycleEndDate" label="结束日期" type="date" />
        <Input v-model="objectiveForm.totalTargetAmount" label="总目标值" type="number" />
        <Input v-model="objectiveForm.scoreCap" label="封顶分" type="number" />
        <Input v-model="objectiveForm.categoryCode" label="考核类型编码" />
        <Input v-model="objectiveForm.categoryName" label="考核类型名称" />
        <Input v-model="objectiveForm.metricCode" label="指标编码" />
        <Input v-model="objectiveForm.metricName" label="指标名称" />
        <Input v-model="objectiveForm.metricUnit" label="指标单位" />
        <Input v-model="objectiveForm.metricWeight" label="指标权重" type="number" />
        <label class="space-y-2"><span class="text-sm font-medium">承接部门</span><Select v-model="objectiveForm.deptId" :options="deptSelectOptions" searchable /></label>
        <Input v-model="objectiveForm.deptTargetAmount" label="部门目标值" type="number" />
      </div>
      <div v-else-if="dialogMode === 'split'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">分解类型</span><Select v-model="splitForm.assigneeType" :options="assigneeTypeOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">分解对象</span><Select v-model="splitForm.assigneeId" :options="assigneeOptions" searchable /></label>
        <Input v-model="splitForm.assigneeName" label="对象名称覆盖" />
        <Input v-model="splitForm.targetAmount" label="目标值" type="number" />
        <Input v-model="splitForm.metricWeight" label="权重" type="number" />
        <label class="space-y-2"><span class="text-sm font-medium">锁定方式</span><Select v-model="splitForm.locked" :options="boolOptions" /></label>
      </div>
      <div v-else-if="dialogMode === 'result'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="resultForm.actualAmount" label="实际完成值" type="number" />
      </div>
      <div v-else-if="dialogMode === 'salary'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="salaryForm.employeeId" :options="employeeOptions" searchable /></label>
        <Input v-model="salaryForm.minScore" label="最低分" type="number" />
        <Input v-model="salaryForm.afterTotal" label="调薪后总额" type="number" />
        <Input v-model="salaryForm.effectiveDate" label="生效日期" type="date" />
        <TextArea v-model="salaryForm.adjustmentReason" label="调薪原因" />
        <TextArea v-model="salaryForm.afterSalaryData" label="调薪后薪资 JSON" />
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
