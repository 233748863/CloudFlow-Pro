<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ClipboardCheck, GitMerge, LogOut, Plus, RefreshCcw, Save, ShieldCheck, UserRoundCheck } from 'lucide-vue-next'
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
  type Candidate,
  type DeptTreeNode,
  type HrEmployee,
  type OnboardingApplication,
  type OnboardingTask,
  type PositionOption,
  type PostOption,
  type ProbationConfirmation,
  type ResignationApplication,
  type ResignationHandover,
  type TransferApplication,
  approveOnboardingApplication,
  approveProbationConfirmation,
  approveResignationApplication,
  approveTransferApplication,
  completeOnboardingTask,
  completeResignationHandover,
  completeResignationInterview,
  confirmOnboardingApplication,
  confirmResignationApplication,
  createOnboardingApplication,
  createProbationConfirmation,
  createResignationApplication,
  createTransferApplication,
  effectiveTransferApplication,
  getDeptTreeOptions,
  getPositionOptions,
  getPostOptions,
  listCandidates,
  listEmployees,
  listOnboardingApplications,
  listOnboardingTasks,
  listProbationByEmployee,
  listResignationByEmployee,
  listResignationHandovers,
  listTransferByEmployee,
  rejectOnboardingApplication,
  rejectProbationConfirmation,
  sendProbationReminders,
  submitOnboardingApplication,
  submitProbationConfirmation,
  submitResignationApplication,
  submitTransferApplication
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  buildEmployeeLabel,
  flattenDeptTree,
  formatDate,
  normalizeRows,
  resignationTypeLabel,
  statusTone,
  todayValue,
  transferTypeLabel,
  workflowStatusLabel
} from './hrUtils'

type ModuleKey = 'onboarding' | 'probation' | 'transfer' | 'resignation'
type DialogMode = 'onboarding' | 'probation' | 'transfer' | 'resignation' | 'rejectProbation' | 'exitInterview' | null
type LifecycleRecord = OnboardingApplication | ProbationConfirmation | TransferApplication | ResignationApplication

const route = useRoute()
const toast = useToastStore()
const loading = ref(false)
const detailLoading = ref(false)
const submitting = ref(false)
const dialogMode = ref<DialogMode>(null)
const selectedId = ref<number | null>(null)
const employees = ref<HrEmployee[]>([])
const candidates = ref<Candidate[]>([])
const deptOptions = ref<DeptTreeNode[]>([])
const postOptions = ref<PostOption[]>([])
const positionOptions = ref<PositionOption[]>([])
const onboardingApplications = ref<OnboardingApplication[]>([])
const probationApplications = ref<ProbationConfirmation[]>([])
const transferApplications = ref<TransferApplication[]>([])
const resignationApplications = ref<ResignationApplication[]>([])
const onboardingTasks = ref<OnboardingTask[]>([])
const resignationHandovers = ref<ResignationHandover[]>([])

const onboardingForm = ref({
  candidateId: '',
  name: '',
  gender: 'MALE',
  phone: '',
  email: '',
  deptId: '',
  postId: '',
  positionId: '',
  expectedDate: todayValue()
})

const probationForm = ref({
  employeeId: '',
  probationStartDate: '',
  probationEndDate: '',
  expectedRegularDate: todayValue(),
  selfEvaluation: '',
  managerEvaluation: ''
})

const transferForm = ref({
  employeeId: '',
  toDeptId: '',
  toPostId: '',
  toPositionId: '',
  transferType: 'DEPT',
  reason: '',
  effectiveDate: todayValue(),
  salaryChange: false
})

const resignationForm = ref({
  employeeId: '',
  resignationType: 'VOLUNTARY',
  resignationReason: '',
  expectedDate: todayValue()
})

const rejectForm = ref({ reason: '', extensionDays: '' })
const interviewForm = ref({ content: '' })

const moduleKey = computed<ModuleKey>(() => {
  if (route.path.includes('/probation')) return 'probation'
  if (route.path.includes('/transfer')) return 'transfer'
  if (route.path.includes('/resignation')) return 'resignation'
  return 'onboarding'
})

const moduleConfig = computed(() => {
  const map = {
    onboarding: { title: '入职办理', eyebrow: 'Onboarding', icon: ClipboardCheck, primary: '新建入职' },
    probation: { title: '转正申请', eyebrow: 'Probation', icon: ShieldCheck, primary: '新建转正' },
    transfer: { title: '调岗管理', eyebrow: 'Transfer', icon: GitMerge, primary: '新建调岗' },
    resignation: { title: '离职办理', eyebrow: 'Resignation', icon: LogOut, primary: '新建离职' }
  }
  return map[moduleKey.value]
})

const activeRecords = computed<LifecycleRecord[]>(() => {
  if (moduleKey.value === 'probation') return probationApplications.value
  if (moduleKey.value === 'transfer') return transferApplications.value
  if (moduleKey.value === 'resignation') return resignationApplications.value
  return onboardingApplications.value
})

const selectedRecord = computed(() => activeRecords.value.find((item) => item.id === selectedId.value) || null)

const columns = computed<Column<LifecycleRecord>[]>(() => {
  if (moduleKey.value === 'onboarding') {
    return [
      { key: 'applicationNo', label: '申请编号' },
      { key: 'name', label: '候选人' },
      { key: 'deptName', label: '组织岗位' },
      { key: 'expectedDate', label: '预计入职' },
      { key: 'status', label: '状态' },
      { key: 'actions', label: '操作', class: 'text-right' }
    ]
  }
  if (moduleKey.value === 'transfer') {
    return [
      { key: 'applicationNo', label: '申请编号' },
      { key: 'employeeName', label: '员工' },
      { key: 'toDeptName', label: '目标组织' },
      { key: 'effectiveDate', label: '生效日期' },
      { key: 'status', label: '状态' },
      { key: 'actions', label: '操作', class: 'text-right' }
    ]
  }
  if (moduleKey.value === 'resignation') {
    return [
      { key: 'applicationNo', label: '申请编号' },
      { key: 'employeeName', label: '员工' },
      { key: 'resignationType', label: '离职类型' },
      { key: 'expectedDate', label: '预计离职' },
      { key: 'status', label: '状态' },
      { key: 'actions', label: '操作', class: 'text-right' }
    ]
  }
  return [
    { key: 'applicationNo', label: '申请编号' },
    { key: 'employeeName', label: '员工' },
    { key: 'probationStartDate', label: '试用周期' },
    { key: 'expectedRegularDate', label: '预计转正' },
    { key: 'status', label: '状态' },
    { key: 'actions', label: '操作', class: 'text-right' }
  ]
})

const employeeOptions = computed<SelectOption[]>(() => employees.value.map((item) => ({ value: item.id, label: buildEmployeeLabel(item) })))
const candidateOptions = computed<SelectOption[]>(() => candidates.value.map((item) => ({ value: item.id, label: `${item.name} · ${item.positionName || item.requestNo || '-'}` })))
const deptSelectOptions = computed<SelectOption[]>(() => flattenDeptTree(deptOptions.value).map((item) => ({ value: item.deptId, label: item.deptName })))
const postSelectOptions = computed<SelectOption[]>(() => normalizeRows<PostOption>(postOptions.value).map((item) => ({ value: item.postId, label: item.postName })))
const positionSelectOptions = computed<SelectOption[]>(() => positionOptions.value.map((item) => ({ value: item.id || item.positionId || 0, label: item.positionName })))

const genderOptions: SelectOption[] = [
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' }
]
const transferOptions: SelectOption[] = Object.entries(transferTypeLabel).map(([value, label]) => ({ value, label }))
const resignationOptions: SelectOption[] = Object.entries(resignationTypeLabel).map(([value, label]) => ({ value, label }))
const boolOptions: SelectOption[] = [
  { value: true, label: '是' },
  { value: false, label: '否' }
]

const summary = computed(() => ({
  total: activeRecords.value.length,
  pending: activeRecords.value.filter((item) => ['DRAFT', 'SUBMITTED', 'APPROVING', 'PENDING'].includes(String(item.status || '').toUpperCase())).length,
  approved: activeRecords.value.filter((item) => ['APPROVED', 'COMPLETED', 'EFFECTIVE', 'CONFIRMED'].includes(String(item.status || '').toUpperCase())).length,
  rejected: activeRecords.value.filter((item) => String(item.status || '').toUpperCase() === 'REJECTED').length
}))

const labelText = (value: unknown, fallback = '-') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const statusLabel = (record: LifecycleRecord | OnboardingTask | ResignationHandover) => {
  const status = String(record.status || '')
  return record.statusDesc || workflowStatusLabel[status] || status || '-'
}

const selectedPersonLabel = computed(() => {
  const record = selectedRecord.value
  if (!record) return '-'
  return 'employeeName' in record ? labelText(record.employeeName) : labelText(record.name)
})

const loadOptions = async () => {
  const [employeeRes, candidateRes, deptRes, postRes, positionRes] = await Promise.allSettled([
    listEmployees(),
    listCandidates({ pageNum: 1, pageSize: 300 }),
    getDeptTreeOptions(),
    getPostOptions(),
    getPositionOptions()
  ])
  employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
  candidates.value = candidateRes.status === 'fulfilled' ? normalizeRows<Candidate>(candidateRes.value) : []
  deptOptions.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
  postOptions.value = postRes.status === 'fulfilled' ? normalizeRows<PostOption>(postRes.value) : []
  positionOptions.value = positionRes.status === 'fulfilled' ? normalizeRows<PositionOption>(positionRes.value) : []
}

const loadData = async () => {
  loading.value = true
  try {
    if (moduleKey.value === 'onboarding') {
      onboardingApplications.value = normalizeRows<OnboardingApplication>(await listOnboardingApplications())
    } else if (moduleKey.value === 'probation') {
      const ids = employees.value.map((item) => item.id)
      const results = await Promise.allSettled(ids.map((id) => listProbationByEmployee(id)))
      probationApplications.value = results.flatMap((item) => item.status === 'fulfilled' ? normalizeRows<ProbationConfirmation>(item.value) : [])
    } else if (moduleKey.value === 'transfer') {
      const ids = employees.value.map((item) => item.id)
      const results = await Promise.allSettled(ids.map((id) => listTransferByEmployee(id)))
      transferApplications.value = results.flatMap((item) => item.status === 'fulfilled' ? normalizeRows<TransferApplication>(item.value) : [])
    } else {
      const ids = employees.value.map((item) => item.id)
      const results = await Promise.allSettled(ids.map((id) => listResignationByEmployee(id)))
      resignationApplications.value = results.flatMap((item) => item.status === 'fulfilled' ? normalizeRows<ResignationApplication>(item.value) : [])
    }
    selectedId.value = activeRecords.value[0]?.id || null
    await loadDetail()
  } catch (error) {
    toast.error(getErrorMessage(error, '流程数据加载失败'))
  } finally {
    loading.value = false
  }
}

const loadDetail = async () => {
  detailLoading.value = true
  try {
    onboardingTasks.value = []
    resignationHandovers.value = []
    if (moduleKey.value === 'onboarding' && selectedId.value) {
      onboardingTasks.value = normalizeRows<OnboardingTask>(await listOnboardingTasks(selectedId.value))
    }
    if (moduleKey.value === 'resignation' && selectedId.value) {
      resignationHandovers.value = normalizeRows<ResignationHandover>(await listResignationHandovers(selectedId.value))
    }
  } catch {
    onboardingTasks.value = []
    resignationHandovers.value = []
  } finally {
    detailLoading.value = false
  }
}

const openCreate = () => {
  if (moduleKey.value === 'onboarding') {
    const candidate = candidates.value[0]
    onboardingForm.value = {
      candidateId: String(candidate?.id || ''),
      name: candidate?.name || '',
      gender: candidate?.gender || 'MALE',
      phone: candidate?.phone || '',
      email: candidate?.email || '',
      deptId: String(candidate?.deptId || deptSelectOptions.value[0]?.value || ''),
      postId: String(postSelectOptions.value[0]?.value || ''),
      positionId: String(candidate?.positionId || positionSelectOptions.value[0]?.value || ''),
      expectedDate: candidate?.expectedDate || todayValue()
    }
  } else if (moduleKey.value === 'probation') {
    probationForm.value = { employeeId: String(employeeOptions.value[0]?.value || ''), probationStartDate: '', probationEndDate: '', expectedRegularDate: todayValue(), selfEvaluation: '', managerEvaluation: '' }
  } else if (moduleKey.value === 'transfer') {
    transferForm.value = { employeeId: String(employeeOptions.value[0]?.value || ''), toDeptId: String(deptSelectOptions.value[0]?.value || ''), toPostId: String(postSelectOptions.value[0]?.value || ''), toPositionId: String(positionSelectOptions.value[0]?.value || ''), transferType: 'DEPT', reason: '', effectiveDate: todayValue(), salaryChange: false }
  } else {
    resignationForm.value = { employeeId: String(employeeOptions.value[0]?.value || ''), resignationType: 'VOLUNTARY', resignationReason: '', expectedDate: todayValue() }
  }
  dialogMode.value = moduleKey.value
}

const handleCandidateChange = (value: string | number | boolean | null) => {
  const candidate = candidates.value.find((item) => item.id === Number(value))
  if (!candidate) return
  onboardingForm.value.name = candidate.name
  onboardingForm.value.gender = candidate.gender || onboardingForm.value.gender
  onboardingForm.value.phone = candidate.phone || onboardingForm.value.phone
  onboardingForm.value.email = candidate.email || onboardingForm.value.email
  onboardingForm.value.deptId = String(candidate.deptId || onboardingForm.value.deptId)
  onboardingForm.value.positionId = String(candidate.positionId || onboardingForm.value.positionId)
}

const handleSave = async () => {
  submitting.value = true
  try {
    if (dialogMode.value === 'onboarding') {
      await createOnboardingApplication({
        candidateId: onboardingForm.value.candidateId ? Number(onboardingForm.value.candidateId) : undefined,
        name: onboardingForm.value.name,
        gender: onboardingForm.value.gender,
        phone: onboardingForm.value.phone,
        email: onboardingForm.value.email,
        deptId: Number(onboardingForm.value.deptId),
        postId: Number(onboardingForm.value.postId),
        positionId: onboardingForm.value.positionId ? Number(onboardingForm.value.positionId) : undefined,
        expectedDate: onboardingForm.value.expectedDate
      })
    } else if (dialogMode.value === 'probation') {
      await createProbationConfirmation({
        employeeId: Number(probationForm.value.employeeId),
        probationStartDate: probationForm.value.probationStartDate || undefined,
        probationEndDate: probationForm.value.probationEndDate || undefined,
        expectedRegularDate: probationForm.value.expectedRegularDate || undefined,
        selfEvaluation: probationForm.value.selfEvaluation,
        managerEvaluation: probationForm.value.managerEvaluation
      })
    } else if (dialogMode.value === 'transfer') {
      await createTransferApplication({
        employeeId: Number(transferForm.value.employeeId),
        toDeptId: Number(transferForm.value.toDeptId),
        toPostId: Number(transferForm.value.toPostId),
        toPositionId: transferForm.value.toPositionId ? Number(transferForm.value.toPositionId) : undefined,
        transferType: transferForm.value.transferType,
        reason: transferForm.value.reason,
        effectiveDate: transferForm.value.effectiveDate,
        salaryChange: transferForm.value.salaryChange
      })
    } else if (dialogMode.value === 'resignation') {
      await createResignationApplication({
        employeeId: Number(resignationForm.value.employeeId),
        resignationType: resignationForm.value.resignationType,
        resignationReason: resignationForm.value.resignationReason,
        expectedDate: resignationForm.value.expectedDate
      })
    } else if (dialogMode.value === 'rejectProbation' && selectedId.value) {
      await rejectProbationConfirmation(selectedId.value, rejectForm.value.reason, rejectForm.value.extensionDays ? Number(rejectForm.value.extensionDays) : undefined)
    } else if (dialogMode.value === 'exitInterview' && selectedId.value) {
      await completeResignationInterview(selectedId.value, interviewForm.value.content)
    }
    dialogMode.value = null
    toast.success('保存成功')
    await loadData()
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
    await loadData()
  } catch (error) {
    toast.error(getErrorMessage(error, '操作失败'))
  } finally {
    submitting.value = false
  }
}

const runPrimarySubmit = (id: number) => {
  if (moduleKey.value === 'onboarding') return runAction(() => submitOnboardingApplication(id), '已提交')
  if (moduleKey.value === 'probation') return runAction(() => submitProbationConfirmation(id), '已提交')
  if (moduleKey.value === 'transfer') return runAction(() => submitTransferApplication(id), '已提交')
  return runAction(() => submitResignationApplication(id), '已提交')
}

const runPrimaryApprove = (id: number) => {
  if (moduleKey.value === 'onboarding') return runAction(() => approveOnboardingApplication(id), '已审批')
  if (moduleKey.value === 'probation') return runAction(() => approveProbationConfirmation(id), '已审批')
  if (moduleKey.value === 'transfer') return runAction(() => approveTransferApplication(id), '已审批')
  return runAction(() => approveResignationApplication(id), '已审批')
}

watch(moduleKey, async () => {
  selectedId.value = null
  await loadData()
})

watch(selectedId, () => {
  void loadDetail()
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
          <component :is="moduleConfig.icon" class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          {{ moduleConfig.eyebrow }}
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{{ moduleConfig.title }}</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="loadData"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="openCreate"><Plus class="h-4 w-4" />{{ moduleConfig.primary }}</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">总数</div><div class="mt-2 text-2xl font-semibold">{{ summary.total }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">待处理</div><div class="mt-2 text-2xl font-semibold">{{ summary.pending }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">已通过</div><div class="mt-2 text-2xl font-semibold">{{ summary.approved }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">已拒绝</div><div class="mt-2 text-2xl font-semibold">{{ summary.rejected }}</div></div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
      <Panel :title="moduleConfig.title + '清单'">
        <template #icon><component :is="moduleConfig.icon" class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="columns" :data="activeRecords" :loading="loading" row-key="id">
          <template #cell-name="{ row }">
            <button type="button" class="text-left" @click="selectedId = row.id">
              <div class="font-semibold">{{ row.name }}</div>
              <div class="text-xs text-slate-500">{{ row.phone || row.applicationNo || '-' }}</div>
            </button>
          </template>
          <template #cell-employeeName="{ row }">
            <button type="button" class="text-left" @click="selectedId = row.id">
              <div class="font-semibold">{{ row.employeeName || row.employeeId }}</div>
              <div class="text-xs text-slate-500">{{ row.employeeNo || row.applicationNo || '-' }}</div>
            </button>
          </template>
          <template #cell-deptName="{ row }">{{ row.deptName || '-' }}<div class="text-xs text-slate-500">{{ row.postName || row.positionName || '-' }}</div></template>
          <template #cell-toDeptName="{ row }">{{ row.toDeptName || '-' }}<div class="text-xs text-slate-500">{{ row.toPostName || row.toPositionName || '-' }}</div></template>
          <template #cell-resignationType="{ row }">{{ row.resignationTypeDesc || resignationTypeLabel[String(row.resignationType || '')] || row.resignationType }}</template>
          <template #cell-probationStartDate="{ row }">{{ formatDate(String(row.probationStartDate || '')) }} ~ {{ formatDate(String(row.probationEndDate || '')) }}</template>
          <template #cell-expectedDate="{ row }">{{ formatDate(String(row.expectedDate || '')) }}</template>
          <template #cell-expectedRegularDate="{ row }">{{ formatDate(String(row.expectedRegularDate || '')) }}</template>
          <template #cell-effectiveDate="{ row }">{{ formatDate(String(row.effectiveDate || '')) }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row)" :tone="statusTone(row.status)" /></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="sm" :variant="selectedId === row.id ? 'primary' : 'outline'" @click="selectedId = row.id">详情</Button>
              <Button size="sm" variant="outline" @click="runPrimarySubmit(row.id)">提交</Button>
              <Button size="sm" @click="runPrimaryApprove(row.id)">审批</Button>
            </div>
          </template>
        </DataTable>
      </Panel>

      <Panel title="处理工作区">
        <template #icon><UserRoundCheck class="h-4 w-4 text-slate-500" /></template>
        <div v-if="selectedRecord" class="space-y-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ selectedRecord.applicationNo || selectedRecord.id }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ selectedPersonLabel }}</div>
              </div>
              <StatusBadge :label="statusLabel(selectedRecord)" :tone="statusTone(selectedRecord.status)" />
            </div>
          </div>

          <div v-if="moduleKey === 'onboarding'" class="space-y-3">
            <div class="grid gap-2 sm:grid-cols-2">
              <Button size="sm" variant="outline" @click="runAction(() => rejectOnboardingApplication(selectedRecord!.id), '已拒绝')">拒绝</Button>
              <Button size="sm" @click="runAction(() => confirmOnboardingApplication(selectedRecord!.id, todayValue()), '已确认入职')">确认入职</Button>
            </div>
            <DataTable :columns="[{ key: 'taskName', label: '任务' }, { key: 'assigneeName', label: '负责人' }, { key: 'status', label: '状态' }, { key: 'actions', label: '操作', class: 'text-right' }]" :data="onboardingTasks" :loading="detailLoading" row-key="id">
              <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row)" :tone="statusTone(row.status)" /></template>
              <template #cell-actions="{ row }"><Button size="sm" @click="runAction(() => completeOnboardingTask(row.id, '已办理'), '任务已完成')">完成</Button></template>
            </DataTable>
          </div>

          <div v-else-if="moduleKey === 'probation'" class="space-y-3">
            <div class="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950/60">
              <div class="font-semibold">自评</div>
              <p class="mt-2 whitespace-pre-wrap text-slate-500">{{ selectedRecord.selfEvaluation || '-' }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" @click="dialogMode = 'rejectProbation'">拒绝/延期</Button>
              <Button size="sm" @click="runAction(() => sendProbationReminders(), '已发送提醒')">发送提醒</Button>
            </div>
          </div>

          <div v-else-if="moduleKey === 'transfer'" class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="card p-3"><div class="text-xs text-slate-500">原组织</div><div class="mt-1 font-semibold">{{ selectedRecord.fromDeptName || '-' }}</div></div>
              <div class="card p-3"><div class="text-xs text-slate-500">目标组织</div><div class="mt-1 font-semibold">{{ selectedRecord.toDeptName || '-' }}</div></div>
            </div>
            <Button size="sm" @click="runAction(() => effectiveTransferApplication(selectedRecord!.id), '调岗已生效')">调岗生效</Button>
          </div>

          <div v-else class="space-y-3">
            <div class="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" @click="dialogMode = 'exitInterview'; interviewForm.content = ''">离职面谈</Button>
              <Button size="sm" @click="runAction(() => confirmResignationApplication(selectedRecord!.id, todayValue()), '已确认离职')">确认离职</Button>
            </div>
            <DataTable :columns="[{ key: 'handoverItem', label: '交接项' }, { key: 'handoverToName', label: '接收人' }, { key: 'status', label: '状态' }, { key: 'actions', label: '操作', class: 'text-right' }]" :data="resignationHandovers" :loading="detailLoading" row-key="id">
              <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row)" :tone="statusTone(row.status)" /></template>
              <template #cell-actions="{ row }"><Button size="sm" @click="runAction(() => completeResignationHandover(row.id, '已交接'), '交接已完成')">完成</Button></template>
            </DataTable>
          </div>
        </div>
        <div v-else class="py-12 text-center text-sm text-slate-500">请选择记录</div>
      </Panel>
    </div>

    <BaseDialog :show="Boolean(dialogMode)" :title="moduleConfig.primary" width="wide" @close="dialogMode = null">
      <div v-if="dialogMode === 'onboarding'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">候选人</span><Select v-model="onboardingForm.candidateId" :options="candidateOptions" searchable @change="handleCandidateChange" /></label>
        <Input v-model="onboardingForm.name" label="姓名" required />
        <label class="space-y-2"><span class="text-sm font-medium">性别</span><Select v-model="onboardingForm.gender" :options="genderOptions" /></label>
        <Input v-model="onboardingForm.phone" label="手机号" required />
        <Input v-model="onboardingForm.email" label="邮箱" />
        <label class="space-y-2"><span class="text-sm font-medium">部门</span><Select v-model="onboardingForm.deptId" :options="deptSelectOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">岗位</span><Select v-model="onboardingForm.postId" :options="postSelectOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">职位</span><Select v-model="onboardingForm.positionId" :options="positionSelectOptions" searchable /></label>
        <Input v-model="onboardingForm.expectedDate" label="预计入职" type="date" />
      </div>
      <div v-else-if="dialogMode === 'probation'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="probationForm.employeeId" :options="employeeOptions" searchable /></label>
        <Input v-model="probationForm.probationStartDate" label="试用开始" type="date" />
        <Input v-model="probationForm.probationEndDate" label="试用结束" type="date" />
        <Input v-model="probationForm.expectedRegularDate" label="预计转正" type="date" />
        <TextArea v-model="probationForm.selfEvaluation" label="自我评价" />
        <TextArea v-model="probationForm.managerEvaluation" label="主管评价" />
      </div>
      <div v-else-if="dialogMode === 'transfer'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="transferForm.employeeId" :options="employeeOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">调岗类型</span><Select v-model="transferForm.transferType" :options="transferOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">目标部门</span><Select v-model="transferForm.toDeptId" :options="deptSelectOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">目标岗位</span><Select v-model="transferForm.toPostId" :options="postSelectOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">目标职位</span><Select v-model="transferForm.toPositionId" :options="positionSelectOptions" searchable /></label>
        <Input v-model="transferForm.effectiveDate" label="生效日期" type="date" />
        <label class="space-y-2"><span class="text-sm font-medium">薪资变化</span><Select v-model="transferForm.salaryChange" :options="boolOptions" /></label>
        <TextArea v-model="transferForm.reason" label="调岗原因" />
      </div>
      <div v-else-if="dialogMode === 'resignation'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="resignationForm.employeeId" :options="employeeOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">离职类型</span><Select v-model="resignationForm.resignationType" :options="resignationOptions" /></label>
        <Input v-model="resignationForm.expectedDate" label="预计离职" type="date" />
        <TextArea v-model="resignationForm.resignationReason" label="离职原因" />
      </div>
      <div v-else-if="dialogMode === 'rejectProbation'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="rejectForm.extensionDays" label="延长天数" type="number" />
        <TextArea v-model="rejectForm.reason" label="拒绝原因" />
      </div>
      <div v-else-if="dialogMode === 'exitInterview'">
        <TextArea v-model="interviewForm.content" label="离职面谈内容" />
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
