<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FileText, Landmark, MailCheck, Plus, RefreshCcw, Save, Send, UserCheck } from 'lucide-vue-next'
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
  type Offer,
  type OnboardingApplication,
  type PositionOption,
  acceptOffer,
  approveOffer,
  convertOfferToOnboarding,
  createOffer,
  getDeptTreeOptions,
  getPositionOptions,
  listCandidates,
  listOffers,
  listOnboardingApplications,
  rejectOffer,
  sendOffer,
  submitOffer
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { flattenDeptTree, formatCurrency, formatDate, normalizeRows, statusTone, todayValue, workflowStatusLabel } from './hrUtils'

const toast = useToastStore()
const loading = ref(false)
const submitting = ref(false)
const dialogOpen = ref(false)
const keyword = ref('')
const offers = ref<Offer[]>([])
const candidates = ref<Candidate[]>([])
const onboardingApplications = ref<OnboardingApplication[]>([])
const deptOptions = ref<DeptTreeNode[]>([])
const positionOptions = ref<PositionOption[]>([])
const selectedOffer = ref<Offer | null>(null)

const form = ref({
  candidateId: '',
  deptId: '',
  positionId: '',
  salary: '',
  expectedDate: todayValue(),
  expiryDate: '',
  offerContent: ''
})

const columns: Column<Offer>[] = [
  { key: 'offerNo', label: 'Offer 编号' },
  { key: 'candidateName', label: '候选人' },
  { key: 'deptName', label: '拟录用岗位' },
  { key: 'salary', label: '薪资' },
  { key: 'expectedDate', label: '预计入职' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const candidateOptions = computed<SelectOption[]>(() =>
  candidates.value.map((item) => ({ value: item.id, label: `${item.name} · ${item.positionName || item.requestNo || '-'}` }))
)
const deptSelectOptions = computed<SelectOption[]>(() =>
  flattenDeptTree(deptOptions.value).map((item) => ({ value: item.deptId, label: item.deptName }))
)
const positionSelectOptions = computed<SelectOption[]>(() =>
  positionOptions.value.map((item) => ({ value: item.id || item.positionId || 0, label: item.positionName }))
)

const onboardingCandidateIds = computed(() =>
  new Set(onboardingApplications.value.map((item) => item.candidateId).filter(Boolean))
)

const filteredOffers = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return offers.value
  return offers.value.filter((item) =>
    [item.offerNo, item.candidateName, item.deptName, item.positionName, item.statusDesc, item.status].some((value) =>
      String(value || '').toLowerCase().includes(q)
    )
  )
})

const summary = computed(() => ({
  total: offers.value.length,
  approving: offers.value.filter((item) => ['DRAFT', 'SUBMITTED', 'APPROVING'].includes(String(item.status || '').toUpperCase())).length,
  sent: offers.value.filter((item) => ['SENT', 'ACCEPTED'].includes(String(item.status || '').toUpperCase())).length,
  converted: offers.value.filter((item) => onboardingCandidateIds.value.has(item.candidateId)).length
}))

const candidateMap = computed(() => new Map(candidates.value.map((item) => [item.id, item])))

const loadOptions = async () => {
  const [candidateRes, deptRes, positionRes, onboardingRes] = await Promise.allSettled([
    listCandidates({ pageNum: 1, pageSize: 300 }),
    getDeptTreeOptions(),
    getPositionOptions(),
    listOnboardingApplications()
  ])
  candidates.value = candidateRes.status === 'fulfilled' ? normalizeRows<Candidate>(candidateRes.value) : []
  deptOptions.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
  positionOptions.value = positionRes.status === 'fulfilled' ? normalizeRows<PositionOption>(positionRes.value) : []
  onboardingApplications.value = onboardingRes.status === 'fulfilled' ? normalizeRows<OnboardingApplication>(onboardingRes.value) : []
}

const loadData = async () => {
  loading.value = true
  try {
    offers.value = normalizeRows<Offer>(await listOffers({ pageNum: 1, pageSize: 300 }))
    if (!selectedOffer.value && offers.value.length) selectedOffer.value = offers.value[0]
  } catch (error) {
    toast.error(getErrorMessage(error, 'Offer 数据加载失败'))
  } finally {
    loading.value = false
  }
}

const openDialog = () => {
  const firstCandidate = candidates.value[0]
  form.value = {
    candidateId: String(firstCandidate?.id || ''),
    deptId: String(firstCandidate?.deptId || deptSelectOptions.value[0]?.value || ''),
    positionId: String(firstCandidate?.positionId || positionSelectOptions.value[0]?.value || ''),
    salary: firstCandidate?.salaryMax ? String(firstCandidate.salaryMax) : '',
    expectedDate: firstCandidate?.expectedDate || todayValue(),
    expiryDate: '',
    offerContent: ''
  }
  dialogOpen.value = true
}

const handleCandidateChange = (value: string | number | boolean | null) => {
  const candidate = candidateMap.value.get(Number(value))
  if (!candidate) return
  form.value.deptId = String(candidate.deptId || form.value.deptId)
  form.value.positionId = String(candidate.positionId || form.value.positionId)
  form.value.salary = String(candidate.salaryMax || candidate.salaryMin || form.value.salary || '')
  form.value.expectedDate = candidate.expectedDate || form.value.expectedDate
  form.value.offerContent = [
    `候选人：${candidate.name}`,
    `拟录用岗位：${candidate.positionName || '-'}`,
    `预计入职：${form.value.expectedDate || '-'}`
  ].join('\n')
}

const handleSave = async () => {
  submitting.value = true
  try {
    await createOffer({
      candidateId: Number(form.value.candidateId),
      deptId: form.value.deptId ? Number(form.value.deptId) : undefined,
      positionId: form.value.positionId ? Number(form.value.positionId) : undefined,
      salary: form.value.salary ? Number(form.value.salary) : undefined,
      expectedDate: form.value.expectedDate || undefined,
      expiryDate: form.value.expiryDate || undefined,
      offerContent: form.value.offerContent
    })
    dialogOpen.value = false
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
    await Promise.all([loadOptions(), loadData()])
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
          <MailCheck class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Offer Desk
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Offer 管理</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="loadData"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="openDialog"><Plus class="h-4 w-4" />新建 Offer</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">Offer 总数</div><div class="mt-2 text-2xl font-semibold">{{ summary.total }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">审批中</div><div class="mt-2 text-2xl font-semibold">{{ summary.approving }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">已发出/接受</div><div class="mt-2 text-2xl font-semibold">{{ summary.sent }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">已转入职</div><div class="mt-2 text-2xl font-semibold">{{ summary.converted }}</div></div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
      <Panel title="Offer 清单">
        <template #icon><FileText class="h-4 w-4 text-slate-500" /></template>
        <div class="mb-4 max-w-md"><Input v-model="keyword" placeholder="搜索编号、候选人、部门、岗位" /></div>
        <DataTable :columns="columns" :data="filteredOffers" :loading="loading" row-key="id">
          <template #cell-candidateName="{ row }">
            <button type="button" class="text-left" @click="selectedOffer = row">
              <div class="font-semibold">{{ row.candidateName || row.candidateId }}</div>
              <div class="text-xs text-slate-500">{{ row.offerNo || '-' }}</div>
            </button>
          </template>
          <template #cell-deptName="{ row }">{{ row.deptName || '-' }}<div class="text-xs text-slate-500">{{ row.positionName || '-' }}</div></template>
          <template #cell-salary="{ row }">{{ formatCurrency(row.salary) }}</template>
          <template #cell-expectedDate="{ row }">{{ formatDate(row.expectedDate || row.expectedArrivalDate) }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="row.statusDesc || workflowStatusLabel[row.status || ''] || row.status || '-'" :tone="statusTone(row.status)" /></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="sm" variant="outline" @click="runAction(() => submitOffer(row.id), '已提交')">提交</Button>
              <Button size="sm" variant="outline" @click="runAction(() => approveOffer(row.id), '已审批')">审批</Button>
              <Button size="icon" variant="ghost" @click="runAction(() => sendOffer(row.id), '已发送')"><Send class="h-4 w-4" /></Button>
            </div>
          </template>
        </DataTable>
      </Panel>

      <Panel title="Offer 详情">
        <template #icon><Landmark class="h-4 w-4 text-slate-500" /></template>
        <div v-if="selectedOffer" class="space-y-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ selectedOffer.candidateName || selectedOffer.candidateId }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ selectedOffer.offerNo || '-' }} · {{ selectedOffer.positionName || '-' }}</div>
              </div>
              <StatusBadge :label="selectedOffer.statusDesc || workflowStatusLabel[selectedOffer.status || ''] || selectedOffer.status || '-'" :tone="statusTone(selectedOffer.status)" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="card p-3"><div class="text-xs text-slate-500">薪资</div><div class="mt-1 text-lg font-semibold">{{ formatCurrency(selectedOffer.salary) }}</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">预计入职</div><div class="mt-1 text-lg font-semibold">{{ formatDate(selectedOffer.expectedDate || selectedOffer.expectedArrivalDate) }}</div></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
            <pre class="whitespace-pre-wrap font-sans">{{ selectedOffer.offerContent || '当前 Offer 未填写正文。' }}</pre>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" @click="runAction(() => acceptOffer(selectedOffer!.id), '已接受')"><UserCheck class="h-3.5 w-3.5" />接受</Button>
            <Button size="sm" variant="outline" @click="runAction(() => rejectOffer(selectedOffer!.id), '已拒绝')">拒绝</Button>
            <Button size="sm" @click="runAction(() => convertOfferToOnboarding(selectedOffer!.id), '已转入职')">转入职</Button>
          </div>
        </div>
        <div v-else class="py-12 text-center text-sm text-slate-500">请选择 Offer</div>
      </Panel>
    </div>

    <BaseDialog :show="dialogOpen" title="新建 Offer" width="wide" @close="dialogOpen = false">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">候选人</span><Select v-model="form.candidateId" :options="candidateOptions" searchable @change="handleCandidateChange" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">部门</span><Select v-model="form.deptId" :options="deptSelectOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">职位</span><Select v-model="form.positionId" :options="positionSelectOptions" searchable /></label>
        <Input v-model="form.salary" label="薪资" type="number" />
        <Input v-model="form.expectedDate" label="预计入职" type="date" />
        <Input v-model="form.expiryDate" label="Offer 失效日" type="date" />
        <TextArea v-model="form.offerContent" label="Offer 正文" class="md:col-span-2" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="submitting" @click="handleSave"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>
