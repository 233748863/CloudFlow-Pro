<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  RefreshCcw,
  Save,
  UserRoundSearch,
  XCircle
} from 'lucide-vue-next'
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
  type Interview,
  type PositionOption,
  type RecruitmentRequest,
  approveRecruitmentRequest,
  cancelInterview,
  cancelRecruitmentRequest,
  completeInterview,
  completeRecruitmentRequest,
  createCandidate,
  createRecruitmentRequest,
  getDeptTreeOptions,
  getPositionOptions,
  listCandidates,
  listInterviews,
  listRecruitmentRequests,
  scheduleInterview,
  submitRecruitmentRequest,
  updateCandidateStatus
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  candidateSourceLabel,
  formatCurrency,
  formatDate,
  normalizeRows,
  parseAttachmentText,
  statusTone,
  todayValue,
  workflowStatusLabel,
  flattenDeptTree
} from './hrUtils'

type TabKey = 'requests' | 'candidates' | 'interviews'
type DialogMode = 'request' | 'candidate' | 'interview' | 'evaluation' | null

const toast = useToastStore()
const loading = ref(false)
const submitting = ref(false)
const tab = ref<TabKey>('requests')
const dialogMode = ref<DialogMode>(null)
const keyword = ref('')
const selectedInterviewId = ref<number | null>(null)
const requests = ref<RecruitmentRequest[]>([])
const candidates = ref<Candidate[]>([])
const interviews = ref<Interview[]>([])
const deptOptions = ref<DeptTreeNode[]>([])
const positionOptions = ref<PositionOption[]>([])

const requestForm = ref({
  deptId: '',
  positionId: '',
  headcount: '1',
  jobRequirements: '',
  salaryMin: '',
  salaryMax: '',
  expectedDate: todayValue()
})

const candidateForm = ref({
  requestId: '',
  name: '',
  gender: 'MALE',
  phone: '',
  email: '',
  source: 'WEBSITE',
  resumeValue: ''
})

const interviewForm = ref({
  candidateId: '',
  interviewRound: 'FIRST',
  interviewType: 'ONSITE',
  interviewTime: '',
  location: '',
  interviewerIds: ''
})

const evaluationForm = ref({
  evaluation: '',
  score: '80',
  result: 'PASSED'
})

const requestColumns: Column<RecruitmentRequest>[] = [
  { key: 'requestNo', label: '需求编号' },
  { key: 'deptName', label: '招聘岗位' },
  { key: 'headcount', label: '人数', sortable: true },
  { key: 'salaryMin', label: '薪资范围' },
  { key: 'status', label: '状态' },
  { key: 'expectedDate', label: '期望到岗' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const candidateColumns: Column<Candidate>[] = [
  { key: 'name', label: '候选人' },
  { key: 'positionName', label: '岗位' },
  { key: 'source', label: '来源' },
  { key: 'status', label: '状态' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const interviewColumns: Column<Interview>[] = [
  { key: 'candidateName', label: '候选人' },
  { key: 'interviewRound', label: '轮次' },
  { key: 'interviewTime', label: '时间地点' },
  { key: 'interviewerNames', label: '面试官' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const genderOptions: SelectOption[] = [
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' }
]

const sourceOptions: SelectOption[] = Object.entries(candidateSourceLabel).map(([value, label]) => ({ value, label }))
const roundOptions: SelectOption[] = [
  { value: 'FIRST', label: '初试' },
  { value: 'SECOND', label: '复试' },
  { value: 'FINAL', label: '终试' }
]
const interviewTypeOptions: SelectOption[] = [
  { value: 'ONSITE', label: '现场面试' },
  { value: 'ONLINE', label: '在线视频' },
  { value: 'PHONE', label: '电话面试' }
]
const resultOptions: SelectOption[] = [
  { value: 'PASSED', label: '通过' },
  { value: 'FAILED', label: '未通过' }
]

const deptSelectOptions = computed<SelectOption[]>(() =>
  flattenDeptTree(deptOptions.value).map((item) => ({ value: item.deptId, label: item.deptName }))
)
const positionSelectOptions = computed<SelectOption[]>(() =>
  positionOptions.value.map((item) => ({ value: item.id || item.positionId || 0, label: item.positionName }))
)
const requestSelectOptions = computed<SelectOption[]>(() =>
  requests.value.map((item) => ({
    value: item.id,
    label: `${item.requestNo || item.id} · ${item.deptName || '-'} / ${item.positionName || '-'}`
  }))
)
const candidateSelectOptions = computed<SelectOption[]>(() =>
  candidates.value.map((item) => ({ value: item.id, label: `${item.name} · ${item.positionName || item.requestNo || '-'}` }))
)

const filteredRequests = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return requests.value
  return requests.value.filter((item) =>
    [item.requestNo, item.deptName, item.positionName, item.statusDesc, item.status].some((value) =>
      String(value || '').toLowerCase().includes(q)
    )
  )
})

const filteredCandidates = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return candidates.value
  return candidates.value.filter((item) =>
    [item.name, item.phone, item.email, item.positionName, item.statusDesc, item.status].some((value) =>
      String(value || '').toLowerCase().includes(q)
    )
  )
})

const summary = computed(() => ({
  requests: requests.value.length,
  candidates: candidates.value.length,
  interviews: interviews.value.length,
  active: requests.value.filter((item) => ['APPROVED', 'RECRUITING', 'ACTIVE'].includes(String(item.status || '').toUpperCase())).length
}))

const loadOptions = async () => {
  const [deptRes, positionRes] = await Promise.allSettled([getDeptTreeOptions(), getPositionOptions()])
  deptOptions.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
  positionOptions.value = positionRes.status === 'fulfilled' ? normalizeRows<PositionOption>(positionRes.value) : []
}

const loadData = async () => {
  loading.value = true
  try {
    const [requestRes, candidateRes, interviewRes] = await Promise.all([
      listRecruitmentRequests({ pageNum: 1, pageSize: 200 }),
      listCandidates({ pageNum: 1, pageSize: 200 }),
      listInterviews({ pageNum: 1, pageSize: 200 })
    ])
    requests.value = normalizeRows<RecruitmentRequest>(requestRes)
    candidates.value = normalizeRows<Candidate>(candidateRes)
    interviews.value = normalizeRows<Interview>(interviewRes)
  } catch (error) {
    toast.error(getErrorMessage(error, '招聘数据加载失败'))
  } finally {
    loading.value = false
  }
}

const openRequestDialog = () => {
  requestForm.value = {
    deptId: String(deptSelectOptions.value[0]?.value || ''),
    positionId: String(positionSelectOptions.value[0]?.value || ''),
    headcount: '1',
    jobRequirements: '',
    salaryMin: '',
    salaryMax: '',
    expectedDate: todayValue()
  }
  dialogMode.value = 'request'
}

const openCandidateDialog = () => {
  candidateForm.value = {
    requestId: String(requestSelectOptions.value[0]?.value || ''),
    name: '',
    gender: 'MALE',
    phone: '',
    email: '',
    source: 'WEBSITE',
    resumeValue: ''
  }
  dialogMode.value = 'candidate'
}

const openInterviewDialog = () => {
  interviewForm.value = {
    candidateId: String(candidateSelectOptions.value[0]?.value || ''),
    interviewRound: 'FIRST',
    interviewType: 'ONSITE',
    interviewTime: '',
    location: '',
    interviewerIds: ''
  }
  dialogMode.value = 'interview'
}

const openEvaluationDialog = (id: number) => {
  selectedInterviewId.value = id
  evaluationForm.value = { evaluation: '', score: '80', result: 'PASSED' }
  dialogMode.value = 'evaluation'
}

const parseIds = (value: string) =>
  value.split(/[,，\s]+/).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)

const handleSave = async () => {
  submitting.value = true
  try {
    if (dialogMode.value === 'request') {
      await createRecruitmentRequest({
        deptId: Number(requestForm.value.deptId),
        positionId: Number(requestForm.value.positionId),
        headcount: Number(requestForm.value.headcount || 1),
        jobRequirements: requestForm.value.jobRequirements,
        salaryMin: requestForm.value.salaryMin ? Number(requestForm.value.salaryMin) : undefined,
        salaryMax: requestForm.value.salaryMax ? Number(requestForm.value.salaryMax) : undefined,
        expectedDate: requestForm.value.expectedDate || undefined
      })
    } else if (dialogMode.value === 'candidate') {
      await createCandidate({
        requestId: candidateForm.value.requestId ? Number(candidateForm.value.requestId) : undefined,
        name: candidateForm.value.name,
        gender: candidateForm.value.gender,
        phone: candidateForm.value.phone,
        email: candidateForm.value.email,
        source: candidateForm.value.source,
        resumeAttachmentUrls: parseAttachmentText(candidateForm.value.resumeValue)
      })
    } else if (dialogMode.value === 'interview') {
      await scheduleInterview({
        candidateId: Number(interviewForm.value.candidateId),
        interviewRound: interviewForm.value.interviewRound,
        interviewType: interviewForm.value.interviewType,
        interviewTime: interviewForm.value.interviewTime,
        location: interviewForm.value.location,
        interviewerIds: parseIds(interviewForm.value.interviewerIds)
      })
    } else if (dialogMode.value === 'evaluation' && selectedInterviewId.value) {
      await completeInterview(selectedInterviewId.value, {
        evaluation: evaluationForm.value.evaluation,
        score: Number(evaluationForm.value.score || 0),
        result: evaluationForm.value.result
      })
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

onMounted(async () => {
  await Promise.all([loadOptions(), loadData()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Briefcase class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Recruiting Pipeline
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">招聘管理</h1>
      </div>
      <Button variant="outline" :disabled="loading" @click="loadData">
        <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">招聘需求</div><div class="mt-2 text-2xl font-semibold">{{ summary.requests }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">候选人</div><div class="mt-2 text-2xl font-semibold">{{ summary.candidates }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">面试安排</div><div class="mt-2 text-2xl font-semibold">{{ summary.interviews }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">进行中需求</div><div class="mt-2 text-2xl font-semibold">{{ summary.active }}</div></div>
    </div>

    <div class="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
      <Button :variant="tab === 'requests' ? 'primary' : 'outline'" size="sm" @click="tab = 'requests'">招聘需求</Button>
      <Button :variant="tab === 'candidates' ? 'primary' : 'outline'" size="sm" @click="tab = 'candidates'">候选人</Button>
      <Button :variant="tab === 'interviews' ? 'primary' : 'outline'" size="sm" @click="tab = 'interviews'">面试</Button>
    </div>

    <Panel v-if="tab === 'requests'" title="招聘需求">
      <template #icon><ClipboardCheck class="h-4 w-4 text-slate-500" /></template>
      <template #actions><Button size="sm" @click="openRequestDialog"><Plus class="h-3.5 w-3.5" />新建需求</Button></template>
      <div class="mb-4 max-w-md"><Input v-model="keyword" placeholder="搜索需求、部门、职位、状态" /></div>
      <DataTable :columns="requestColumns" :data="filteredRequests" :loading="loading" row-key="id">
        <template #cell-deptName="{ row }">
          <div class="font-semibold">{{ row.deptName || '-' }}</div>
          <div class="text-xs text-slate-500">{{ row.positionName || '-' }}</div>
        </template>
        <template #cell-salaryMin="{ row }">{{ formatCurrency(row.salaryMin) }} - {{ formatCurrency(row.salaryMax) }}</template>
        <template #cell-status="{ row }"><StatusBadge :label="row.statusDesc || workflowStatusLabel[row.status || ''] || row.status || '-'" :tone="statusTone(row.status)" /></template>
        <template #cell-expectedDate="{ row }">{{ formatDate(row.expectedDate) }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="sm" variant="outline" @click="runAction(() => submitRecruitmentRequest(row.id), '已提交')">提交</Button>
            <Button size="sm" variant="outline" @click="runAction(() => approveRecruitmentRequest(row.id), '已审批')">审批</Button>
            <Button size="sm" @click="runAction(() => completeRecruitmentRequest(row.id), '已完成')">完成</Button>
            <Button size="icon" variant="ghost" @click="runAction(() => cancelRecruitmentRequest(row.id), '已取消')"><XCircle class="h-4 w-4" /></Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <Panel v-else-if="tab === 'candidates'" title="候选人">
      <template #icon><UserRoundSearch class="h-4 w-4 text-slate-500" /></template>
      <template #actions><Button size="sm" @click="openCandidateDialog"><Plus class="h-3.5 w-3.5" />新增候选人</Button></template>
      <div class="mb-4 max-w-md"><Input v-model="keyword" placeholder="搜索姓名、电话、邮箱、职位" /></div>
      <DataTable :columns="candidateColumns" :data="filteredCandidates" :loading="loading" row-key="id">
        <template #cell-name="{ row }">
          <div class="font-semibold">{{ row.name }}</div>
          <div class="text-xs text-slate-500">{{ row.phone || row.email || '-' }}</div>
        </template>
        <template #cell-source="{ row }">{{ row.sourceDesc || candidateSourceLabel[row.source || ''] || row.source || '-' }}</template>
        <template #cell-status="{ row }"><StatusBadge :label="row.statusDesc || workflowStatusLabel[row.status || ''] || row.status || '-'" :tone="statusTone(row.status)" /></template>
        <template #cell-createTime="{ row }">{{ formatDate(row.createTime) }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="sm" variant="outline" @click="runAction(() => updateCandidateStatus(row.id, 'INTERVIEW'), '已进入面试')">面试</Button>
            <Button size="sm" @click="runAction(() => updateCandidateStatus(row.id, 'PASSED'), '已通过')">通过</Button>
            <Button size="icon" variant="ghost" @click="runAction(() => updateCandidateStatus(row.id, 'REJECTED', 'HR 操作拒绝'), '已拒绝')"><XCircle class="h-4 w-4" /></Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <Panel v-else title="面试安排">
      <template #icon><CalendarClock class="h-4 w-4 text-slate-500" /></template>
      <template #actions><Button size="sm" @click="openInterviewDialog"><Plus class="h-3.5 w-3.5" />安排面试</Button></template>
      <DataTable :columns="interviewColumns" :data="interviews" :loading="loading" row-key="id">
        <template #cell-interviewRound="{ row }">{{ row.interviewRoundName || row.interviewRound || '-' }}<div class="text-xs text-slate-500">{{ row.interviewTypeName || row.interviewType || '-' }}</div></template>
        <template #cell-interviewTime="{ row }">{{ row.interviewTime || '-' }}<div class="text-xs text-slate-500">{{ row.location || '-' }}</div></template>
        <template #cell-interviewerNames="{ row }">{{ row.interviewerNames?.join('、') || '-' }}</template>
        <template #cell-status="{ row }"><StatusBadge :label="row.statusName || workflowStatusLabel[row.status || ''] || row.status || '-'" :tone="statusTone(row.status)" /></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openEvaluationDialog(row.id)"><CheckCircle2 class="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" @click="runAction(() => cancelInterview(row.id), '已取消')"><XCircle class="h-4 w-4" /></Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <BaseDialog :show="Boolean(dialogMode)" title="招聘操作" width="wide" @close="dialogMode = null">
      <div v-if="dialogMode === 'request'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">部门</span><Select v-model="requestForm.deptId" :options="deptSelectOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">职位</span><Select v-model="requestForm.positionId" :options="positionSelectOptions" searchable /></label>
        <Input v-model="requestForm.headcount" label="招聘人数" type="number" />
        <Input v-model="requestForm.expectedDate" label="期望到岗" type="date" />
        <Input v-model="requestForm.salaryMin" label="薪资下限" type="number" />
        <Input v-model="requestForm.salaryMax" label="薪资上限" type="number" />
        <TextArea v-model="requestForm.jobRequirements" label="岗位要求" class="md:col-span-2" />
      </div>
      <div v-else-if="dialogMode === 'candidate'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">关联需求</span><Select v-model="candidateForm.requestId" :options="requestSelectOptions" searchable /></label>
        <Input v-model="candidateForm.name" label="姓名" required />
        <label class="space-y-2"><span class="text-sm font-medium">性别</span><Select v-model="candidateForm.gender" :options="genderOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">来源</span><Select v-model="candidateForm.source" :options="sourceOptions" /></label>
        <Input v-model="candidateForm.phone" label="手机号" />
        <Input v-model="candidateForm.email" label="邮箱" />
        <TextArea v-model="candidateForm.resumeValue" label="简历 URL（一行一个）" class="md:col-span-2" />
      </div>
      <div v-else-if="dialogMode === 'interview'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">候选人</span><Select v-model="interviewForm.candidateId" :options="candidateSelectOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">轮次</span><Select v-model="interviewForm.interviewRound" :options="roundOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">形式</span><Select v-model="interviewForm.interviewType" :options="interviewTypeOptions" /></label>
        <Input v-model="interviewForm.interviewTime" label="面试时间" type="datetime-local" />
        <Input v-model="interviewForm.location" label="地点/会议链接" />
        <Input v-model="interviewForm.interviewerIds" label="面试官用户ID（逗号分隔）" />
      </div>
      <div v-else-if="dialogMode === 'evaluation'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">结果</span><Select v-model="evaluationForm.result" :options="resultOptions" /></label>
        <Input v-model="evaluationForm.score" label="评分" type="number" />
        <TextArea v-model="evaluationForm.evaluation" label="面试评价" class="md:col-span-2" />
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
