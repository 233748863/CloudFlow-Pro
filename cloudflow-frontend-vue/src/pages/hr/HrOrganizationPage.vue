<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { GitBranch, Layers3, Plus, RefreshCcw, Save, Trash2, Users } from 'lucide-vue-next'
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
  type JobLevel,
  type JobLevelPayload,
  type PositionDetail,
  type PositionFamily,
  type PositionFamilyPayload,
  type PositionOption,
  type PositionPayload,
  type PostOption,
  type ReportingLine,
  createJobLevel,
  createPosition,
  createPositionFamily,
  deleteJobLevel,
  deletePosition,
  deletePositionFamily,
  deleteReportingLine,
  getDeptTreeOptions,
  getPosition,
  getPostOptions,
  getReportingMatrix,
  listEmployees,
  listJobLevels,
  listPositionFamilies,
  listPositions,
  listReportingLines,
  setReportingLine,
  updateJobLevel,
  updatePosition,
  updatePositionFamily
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { buildEmployeeLabel, flattenDeptTree, formatNumber, normalizeRows, statusTone, todayValue } from './hrUtils'

type TabKey = 'families' | 'levels' | 'positions'
type DialogMode = 'family' | 'level' | 'position' | 'reporting' | null
type ConfirmState = { type: 'family' | 'level' | 'position' | 'reporting'; id: number; title: string; message: string }

const toast = useToastStore()
const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const activeTab = ref<TabKey>('families')
const dialogMode = ref<DialogMode>(null)
const confirmState = ref<ConfirmState | null>(null)
const families = ref<PositionFamily[]>([])
const levels = ref<JobLevel[]>([])
const positions = ref<PositionOption[]>([])
const employees = ref<HrEmployee[]>([])
const depts = ref<DeptTreeNode[]>([])
const posts = ref<PostOption[]>([])
const selectedPosition = ref<PositionDetail | null>(null)
const selectedEmployeeId = ref<number | null>(null)
const selectedDeptId = ref<number | null>(null)
const reportingLines = ref<ReportingLine[]>([])
const reportingMatrixLines = ref<ReportingLine[]>([])
const editingId = ref<number | null>(null)

const familyForm = ref({ familyCode: '', familyName: '', description: '', sortOrder: '0', status: 1 })
const levelForm = ref({ levelCode: '', levelName: '', levelSeries: 'P', levelRank: '1', description: '', status: 1 })
const positionForm = ref({
  positionCode: '',
  positionName: '',
  familyId: '',
  levelId: '',
  postId: '',
  jobDescription: '',
  requirements: '',
  workContent: '',
  status: 1
})
const reportingForm = ref({ employeeId: '', reportToId: '', reportType: 'DIRECT', effectiveDate: todayValue(), expiryDate: '' })

const familyColumns: Column<PositionFamily>[] = [
  { key: 'familyCode', label: '编码' },
  { key: 'familyName', label: '职位族' },
  { key: 'description', label: '描述' },
  { key: 'sortOrder', label: '排序' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]
const levelColumns: Column<JobLevel>[] = [
  { key: 'levelCode', label: '编码' },
  { key: 'levelName', label: '职级' },
  { key: 'levelSeries', label: '序列' },
  { key: 'levelRank', label: '等级' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]
const positionColumns: Column<PositionOption>[] = [
  { key: 'positionCode', label: '编码' },
  { key: 'positionName', label: '职位' },
  { key: 'familyName', label: '职位族' },
  { key: 'levelName', label: '职级' },
  { key: 'postName', label: '岗位' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]
const reportingColumns: Column<ReportingLine>[] = [
  { key: 'employeeName', label: '员工' },
  { key: 'reportToName', label: '汇报对象' },
  { key: 'reportType', label: '类型' },
  { key: 'effectiveDate', label: '生效日期' },
  { key: 'expiryDate', label: '失效日期' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const statusOptions: SelectOption[] = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
]
const seriesOptions: SelectOption[] = [
  { value: 'P', label: '专业序列' },
  { value: 'M', label: '管理序列' }
]
const reportTypeOptions: SelectOption[] = [
  { value: 'DIRECT', label: '直接汇报' },
  { value: 'DOTTED', label: '虚线汇报' }
]
const familyOptions = computed<SelectOption[]>(() => families.value.map((item) => ({ value: item.id, label: item.familyName })))
const levelOptions = computed<SelectOption[]>(() => levels.value.map((item) => ({ value: item.id, label: `${item.levelCode} / ${item.levelName}` })))
const postOptions = computed<SelectOption[]>(() => normalizeRows<PostOption>(posts.value).map((item) => ({ value: item.postId, label: item.postName })))
const employeeOptions = computed<SelectOption[]>(() => employees.value.map((item) => ({ value: item.id, label: buildEmployeeLabel(item) })))
const deptOptions = computed<SelectOption[]>(() => flattenDeptTree(depts.value).map((item) => ({ value: item.deptId, label: item.deptName })))
const currentEmployee = computed(() => employees.value.find((item) => item.id === selectedEmployeeId.value) || null)
const summary = computed(() => ({
  families: families.value.length,
  levels: levels.value.length,
  positions: positions.value.length,
  reporting: reportingLines.value.length
}))

const statusLabel = (status?: number) => status === 0 ? '停用' : '启用'
const seriesLabel = (series?: string) => series === 'M' ? '管理序列' : '专业序列'
const reportTypeLabel = (type?: string) => reportTypeOptions.find((item) => item.value === type)?.label || type || '-'
const toNumber = (value: string | number | null | undefined) => value === '' || value == null ? undefined : Number(value)

const loadOptions = async () => {
  const [employeeRes, deptRes, postRes] = await Promise.allSettled([
    listEmployees({ pageNum: 1, pageSize: 500 }),
    getDeptTreeOptions(),
    getPostOptions()
  ])
  employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
  depts.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
  posts.value = postRes.status === 'fulfilled' ? normalizeRows<PostOption>(postRes.value) : []
  selectedEmployeeId.value ||= employees.value[0]?.id || null
  selectedDeptId.value ||= depts.value[0]?.deptId || null
}

const loadData = async () => {
  loading.value = true
  try {
    const [familyRes, levelRes, positionRes] = await Promise.all([
      listPositionFamilies(),
      listJobLevels(),
      listPositions()
    ])
    families.value = normalizeRows<PositionFamily>(familyRes)
    levels.value = normalizeRows<JobLevel>(levelRes)
    positions.value = normalizeRows<PositionOption>(positionRes)
    if (positions.value[0]?.id && !selectedPosition.value) await loadPositionDetail(positions.value[0].id)
    await loadReporting()
  } catch (error) {
    toast.error(getErrorMessage(error, '组织基础配置加载失败'))
  } finally {
    loading.value = false
  }
}

const loadPositionDetail = async (id: number) => {
  detailLoading.value = true
  try {
    selectedPosition.value = await getPosition(id)
  } catch (error) {
    toast.error(getErrorMessage(error, '职位详情加载失败'))
  } finally {
    detailLoading.value = false
  }
}

const loadReporting = async () => {
  if (selectedEmployeeId.value) {
    reportingLines.value = normalizeRows<ReportingLine>(await listReportingLines(selectedEmployeeId.value))
  }
  if (selectedDeptId.value) {
    const matrix = await getReportingMatrix(selectedDeptId.value)
    reportingMatrixLines.value = normalizeRows<ReportingLine>(matrix.reportingLines || [])
  }
}

const openFamilyDialog = (item?: PositionFamily) => {
  editingId.value = item?.id || null
  familyForm.value = {
    familyCode: item?.familyCode || '',
    familyName: item?.familyName || '',
    description: item?.description || '',
    sortOrder: String(item?.sortOrder ?? 0),
    status: item?.status ?? 1
  }
  dialogMode.value = 'family'
}

const openLevelDialog = (item?: JobLevel) => {
  editingId.value = item?.id || null
  levelForm.value = {
    levelCode: item?.levelCode || '',
    levelName: item?.levelName || '',
    levelSeries: item?.levelSeries || 'P',
    levelRank: String(item?.levelRank ?? 1),
    description: item?.description || '',
    status: item?.status ?? 1
  }
  dialogMode.value = 'level'
}

const openPositionDialog = (item?: PositionOption | PositionDetail) => {
  editingId.value = item?.id || null
  positionForm.value = {
    positionCode: item?.positionCode || '',
    positionName: item?.positionName || '',
    familyId: String(item?.familyId || ''),
    levelId: String(item?.levelId || ''),
    postId: String(item?.postId || ''),
    jobDescription: 'jobDescription' in (item || {}) ? String((item as PositionDetail).jobDescription || '') : '',
    requirements: 'requirements' in (item || {}) ? String((item as PositionDetail).requirements || '') : '',
    workContent: 'workContent' in (item || {}) ? String((item as PositionDetail).workContent || '') : '',
    status: item?.status ?? 1
  }
  dialogMode.value = 'position'
}

const openReportingDialog = () => {
  editingId.value = null
  reportingForm.value = {
    employeeId: String(selectedEmployeeId.value || employeeOptions.value[0]?.value || ''),
    reportToId: String(employeeOptions.value.find((item) => item.value !== selectedEmployeeId.value)?.value || ''),
    reportType: 'DIRECT',
    effectiveDate: todayValue(),
    expiryDate: ''
  }
  dialogMode.value = 'reporting'
}

const saveDialog = async () => {
  saving.value = true
  try {
    if (dialogMode.value === 'family') {
      const payload: PositionFamilyPayload = {
        familyCode: familyForm.value.familyCode,
        familyName: familyForm.value.familyName,
        description: familyForm.value.description,
        sortOrder: Number(familyForm.value.sortOrder || 0),
        status: familyForm.value.status
      }
      if (editingId.value) await updatePositionFamily(editingId.value, payload)
      else await createPositionFamily(payload)
    } else if (dialogMode.value === 'level') {
      const payload: JobLevelPayload = {
        levelCode: levelForm.value.levelCode,
        levelName: levelForm.value.levelName,
        levelSeries: levelForm.value.levelSeries,
        levelRank: Number(levelForm.value.levelRank || 1),
        description: levelForm.value.description,
        status: levelForm.value.status
      }
      if (editingId.value) await updateJobLevel(editingId.value, payload)
      else await createJobLevel(payload)
    } else if (dialogMode.value === 'position') {
      const payload: PositionPayload = {
        positionName: positionForm.value.positionName,
        familyId: toNumber(positionForm.value.familyId),
        levelId: toNumber(positionForm.value.levelId),
        postId: toNumber(positionForm.value.postId),
        jobDescription: positionForm.value.jobDescription,
        requirements: positionForm.value.requirements,
        workContent: positionForm.value.workContent,
        status: positionForm.value.status
      }
      if (editingId.value) await updatePosition(editingId.value, payload)
      else await createPosition({ ...payload, positionCode: positionForm.value.positionCode })
    } else if (dialogMode.value === 'reporting') {
      await setReportingLine({
        employeeId: Number(reportingForm.value.employeeId),
        reportToId: Number(reportingForm.value.reportToId),
        reportType: reportingForm.value.reportType,
        effectiveDate: reportingForm.value.effectiveDate,
        expiryDate: reportingForm.value.expiryDate || undefined
      })
      selectedEmployeeId.value = Number(reportingForm.value.employeeId)
    }
    dialogMode.value = null
    toast.success('保存成功')
    await loadData()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

const openDelete = (type: ConfirmState['type'], id: number, title: string) => {
  confirmState.value = { type, id, title, message: `确认删除 ${title}？` }
}

const runDelete = async () => {
  if (!confirmState.value) return
  saving.value = true
  try {
    if (confirmState.value.type === 'family') await deletePositionFamily(confirmState.value.id)
    if (confirmState.value.type === 'level') await deleteJobLevel(confirmState.value.id)
    if (confirmState.value.type === 'position') await deletePosition(confirmState.value.id)
    if (confirmState.value.type === 'reporting') await deleteReportingLine(confirmState.value.id)
    confirmState.value = null
    toast.success('删除成功')
    await loadData()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    saving.value = false
  }
}

watch([selectedEmployeeId, selectedDeptId], () => {
  void loadReporting()
})

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
          <GitBranch class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          HR Organization
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">组织基础配置</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="loadData"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="activeTab === 'families' ? openFamilyDialog() : activeTab === 'levels' ? openLevelDialog() : openPositionDialog()"><Plus class="h-4 w-4" />新建</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">职位族</div><div class="mt-2 text-2xl font-semibold">{{ summary.families }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">职级</div><div class="mt-2 text-2xl font-semibold">{{ summary.levels }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">职位</div><div class="mt-2 text-2xl font-semibold">{{ summary.positions }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">当前汇报关系</div><div class="mt-2 text-2xl font-semibold">{{ summary.reporting }}</div></div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
      <Panel title="职位体系">
        <template #icon><Layers3 class="h-4 w-4 text-slate-500" /></template>
        <div class="mb-3 flex flex-wrap gap-2">
          <Button size="sm" :variant="activeTab === 'families' ? 'primary' : 'outline'" @click="activeTab = 'families'">职位族</Button>
          <Button size="sm" :variant="activeTab === 'levels' ? 'primary' : 'outline'" @click="activeTab = 'levels'">职级</Button>
          <Button size="sm" :variant="activeTab === 'positions' ? 'primary' : 'outline'" @click="activeTab = 'positions'">职位</Button>
        </div>

        <DataTable v-if="activeTab === 'families'" :columns="familyColumns" :data="families" :loading="loading" row-key="id">
          <template #cell-description="{ row }"><span class="text-slate-500">{{ row.description || '-' }}</span></template>
          <template #cell-sortOrder="{ row }">{{ formatNumber(row.sortOrder) }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status ?? 1)" /></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="sm" variant="outline" @click="openFamilyDialog(row)">编辑</Button>
              <Button size="icon" variant="ghost" @click="openDelete('family', row.id, row.familyName)"><Trash2 class="h-4 w-4" /></Button>
            </div>
          </template>
        </DataTable>

        <DataTable v-else-if="activeTab === 'levels'" :columns="levelColumns" :data="levels" :loading="loading" row-key="id">
          <template #cell-levelSeries="{ row }">{{ seriesLabel(row.levelSeries) }}</template>
          <template #cell-levelRank="{ row }">L{{ row.levelRank }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status ?? 1)" /></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="sm" variant="outline" @click="openLevelDialog(row)">编辑</Button>
              <Button size="icon" variant="ghost" @click="openDelete('level', row.id, row.levelName)"><Trash2 class="h-4 w-4" /></Button>
            </div>
          </template>
        </DataTable>

        <DataTable v-else :columns="positionColumns" :data="positions" :loading="loading" row-key="id">
          <template #cell-positionName="{ row }">
            <button type="button" class="text-left" @click="loadPositionDetail(row.id)">
              <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.positionName }}</div>
              <div class="text-xs text-slate-500">{{ row.positionCode || '-' }}</div>
            </button>
          </template>
          <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status ?? 1)" /></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="sm" variant="outline" @click="openPositionDialog(row)">编辑</Button>
              <Button size="icon" variant="ghost" @click="openDelete('position', row.id, row.positionName)"><Trash2 class="h-4 w-4" /></Button>
            </div>
          </template>
        </DataTable>
      </Panel>

      <Panel title="职位详情">
        <template #icon><Layers3 class="h-4 w-4 text-slate-500" /></template>
        <div v-if="detailLoading" class="py-12 text-center text-sm text-slate-500">加载中...</div>
        <div v-else-if="selectedPosition" class="space-y-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ selectedPosition.positionName }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ selectedPosition.positionCode || '-' }} · {{ selectedPosition.postName || selectedPosition.post?.postName || '-' }}</div>
              </div>
              <StatusBadge :label="statusLabel(selectedPosition.status)" :tone="statusTone(selectedPosition.status ?? 1)" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="card p-3"><div class="text-xs text-slate-500">职位族</div><div class="mt-1 text-sm font-semibold">{{ selectedPosition.family?.familyName || selectedPosition.familyName || '-' }}</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">职级</div><div class="mt-1 text-sm font-semibold">{{ selectedPosition.level?.levelName || selectedPosition.levelName || '-' }}</div></div>
          </div>
          <div class="space-y-2 text-sm">
            <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div class="font-medium">岗位职责</div><div class="mt-1 text-slate-500">{{ selectedPosition.jobDescription || '-' }}</div></div>
            <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div class="font-medium">任职要求</div><div class="mt-1 text-slate-500">{{ selectedPosition.requirements || '-' }}</div></div>
            <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div class="font-medium">工作内容</div><div class="mt-1 text-slate-500">{{ selectedPosition.workContent || '-' }}</div></div>
          </div>
        </div>
        <div v-else class="py-12 text-center text-sm text-slate-500">请选择职位</div>
      </Panel>
    </div>

    <div class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="汇报关系筛选">
        <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
        <div class="space-y-3">
          <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="selectedEmployeeId" :options="employeeOptions" searchable /></label>
          <label class="space-y-2"><span class="text-sm font-medium">部门矩阵</span><Select v-model="selectedDeptId" :options="deptOptions" searchable /></label>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
            <div class="font-semibold text-slate-900 dark:text-slate-100">{{ currentEmployee ? buildEmployeeLabel(currentEmployee) : '未选择员工' }}</div>
            <div class="mt-1 text-xs text-slate-500">当前关系 {{ reportingLines.length }} 条 · 部门矩阵 {{ reportingMatrixLines.length }} 条</div>
          </div>
          <Button class="w-full" @click="openReportingDialog"><Plus class="h-4 w-4" />设置汇报关系</Button>
        </div>
      </Panel>

      <Panel title="汇报关系">
        <template #icon><GitBranch class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="reportingColumns" :data="reportingLines" :loading="loading" row-key="id">
          <template #cell-employeeName="{ row }">{{ row.employeeName || row.employeeId }}<div class="text-xs text-slate-500">{{ row.employeeNo || '-' }}</div></template>
          <template #cell-reportToName="{ row }">{{ row.reportToName || row.reportToId }}<div class="text-xs text-slate-500">{{ row.reportToNo || '-' }}</div></template>
          <template #cell-reportType="{ row }"><StatusBadge :label="row.reportTypeDesc || reportTypeLabel(row.reportType)" :tone="row.reportType === 'DIRECT' ? 'green' : 'cyan'" /></template>
          <template #cell-expiryDate="{ row }">{{ row.expiryDate || '长期有效' }}</template>
          <template #cell-actions="{ row }"><div class="flex justify-end"><Button size="icon" variant="ghost" @click="openDelete('reporting', row.id, row.reportTypeDesc || reportTypeLabel(row.reportType))"><Trash2 class="h-4 w-4" /></Button></div></template>
        </DataTable>
      </Panel>
    </div>

    <Panel title="部门汇报矩阵">
      <template #icon><GitBranch class="h-4 w-4 text-slate-500" /></template>
      <DataTable :columns="reportingColumns.filter((item) => item.key !== 'actions')" :data="reportingMatrixLines" :loading="loading" row-key="id">
        <template #cell-employeeName="{ row }">{{ row.employeeName || row.employeeId }}<div class="text-xs text-slate-500">{{ row.employeeNo || '-' }}</div></template>
        <template #cell-reportToName="{ row }">{{ row.reportToName || row.reportToId }}<div class="text-xs text-slate-500">{{ row.reportToNo || '-' }}</div></template>
        <template #cell-reportType="{ row }"><StatusBadge :label="row.reportTypeDesc || reportTypeLabel(row.reportType)" :tone="row.reportType === 'DIRECT' ? 'green' : 'cyan'" /></template>
        <template #cell-expiryDate="{ row }">{{ row.expiryDate || '长期有效' }}</template>
      </DataTable>
    </Panel>

    <BaseDialog :show="Boolean(dialogMode)" title="组织基础配置" width="wide" @close="dialogMode = null">
      <div v-if="dialogMode === 'family'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="familyForm.familyCode" label="职位族编码" required />
        <Input v-model="familyForm.familyName" label="职位族名称" required />
        <Input v-model="familyForm.sortOrder" label="排序" type="number" />
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="familyForm.status" :options="statusOptions" /></label>
        <TextArea v-model="familyForm.description" label="描述" class="md:col-span-2" />
      </div>
      <div v-else-if="dialogMode === 'level'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="levelForm.levelCode" label="职级编码" required />
        <Input v-model="levelForm.levelName" label="职级名称" required />
        <label class="space-y-2"><span class="text-sm font-medium">职级序列</span><Select v-model="levelForm.levelSeries" :options="seriesOptions" /></label>
        <Input v-model="levelForm.levelRank" label="等级" type="number" />
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="levelForm.status" :options="statusOptions" /></label>
        <TextArea v-model="levelForm.description" label="描述" />
      </div>
      <div v-else-if="dialogMode === 'position'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="positionForm.positionCode" label="职位编码" :disabled="Boolean(editingId)" required />
        <Input v-model="positionForm.positionName" label="职位名称" required />
        <label class="space-y-2"><span class="text-sm font-medium">职位族</span><Select v-model="positionForm.familyId" :options="familyOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">职级</span><Select v-model="positionForm.levelId" :options="levelOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">岗位</span><Select v-model="positionForm.postId" :options="postOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="positionForm.status" :options="statusOptions" /></label>
        <TextArea v-model="positionForm.jobDescription" label="岗位职责" />
        <TextArea v-model="positionForm.requirements" label="任职要求" />
        <TextArea v-model="positionForm.workContent" label="工作内容" class="md:col-span-2" />
      </div>
      <div v-else-if="dialogMode === 'reporting'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="reportingForm.employeeId" :options="employeeOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">汇报对象</span><Select v-model="reportingForm.reportToId" :options="employeeOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">汇报类型</span><Select v-model="reportingForm.reportType" :options="reportTypeOptions" /></label>
        <Input v-model="reportingForm.effectiveDate" label="生效日期" type="date" />
        <Input v-model="reportingForm.expiryDate" label="失效日期" type="date" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="dialogMode = null">取消</Button>
          <Button :disabled="saving" @click="saveDialog"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(confirmState)"
      :title="confirmState?.title || ''"
      :message="confirmState?.message || ''"
      confirm-text="删除"
      danger
      @cancel="confirmState = null"
      @confirm="runDelete"
    />
  </div>
</template>
