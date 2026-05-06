<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BarChart3, Layers3, Plus, RefreshCcw, Save, Target } from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  DataTable,
  Input,
  Panel,
  Select,
  StatusBadge,
  type Column,
  type SelectOption
} from '@/components/common'
import {
  type DeptTreeNode,
  type Headcount,
  type HeadcountStatistics,
  type PostOption,
  getDeptTreeOptions,
  getHeadcountStatistics,
  getPostOptions,
  listHeadcounts,
  setHeadcount,
  updateHeadcountActualCount
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { flattenDeptTree, formatDate, formatNumber, normalizeRows, statusTone, todayValue } from './hrUtils'

const toast = useToastStore()
const loading = ref(false)
const submitting = ref(false)
const dialogOpen = ref(false)
const keyword = ref('')
const selectedHeadcount = ref<Headcount | null>(null)
const statistics = ref<HeadcountStatistics | null>(null)
const headcounts = ref<Headcount[]>([])
const deptOptions = ref<DeptTreeNode[]>([])
const postOptions = ref<PostOption[]>([])

const form = ref({
  targetType: 'DEPT',
  targetId: '',
  approvedCount: '1',
  actualCount: '0',
  effectiveDate: todayValue(),
  expiryDate: ''
})

const columns: Column<Headcount>[] = [
  { key: 'targetName', label: '组织对象' },
  { key: 'approvedCount', label: '核定编制', sortable: true },
  { key: 'actualCount', label: '实际人数', sortable: true },
  { key: 'vacancyCount', label: '空缺', sortable: true },
  { key: 'effectiveDate', label: '有效期' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const targetTypeOptions: SelectOption[] = [
  { value: 'DEPT', label: '部门' },
  { value: 'POST', label: '岗位' }
]

const deptSelectOptions = computed<SelectOption[]>(() =>
  flattenDeptTree(deptOptions.value).map((item) => ({ value: item.deptId, label: item.deptName }))
)

const postSelectOptions = computed<SelectOption[]>(() =>
  normalizeRows<PostOption>(postOptions.value).map((item) => ({ value: item.postId, label: item.postName }))
)

const targetOptions = computed(() => form.value.targetType === 'DEPT' ? deptSelectOptions.value : postSelectOptions.value)

const filteredHeadcounts = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return headcounts.value
  return headcounts.value.filter((item) =>
    [item.targetType, item.targetName, item.targetId].some((value) =>
      String(value || '').toLowerCase().includes(q)
    )
  )
})

const summary = computed(() => {
  const approved = headcounts.value.reduce((sum, item) => sum + Number(item.approvedCount || 0), 0)
  const actual = headcounts.value.reduce((sum, item) => sum + Number(item.actualCount || 0), 0)
  const vacancy = headcounts.value.reduce((sum, item) => sum + Number(item.vacancyCount || 0), 0)
  const overstaffed = headcounts.value.filter((item) => Number(item.vacancyCount || 0) < 0).length
  return { approved, actual, vacancy, overstaffed }
})

const vacancyTone = (item: Headcount) => {
  if (Number(item.vacancyCount || 0) < 0) return 'red'
  if (Number(item.vacancyCount || 0) > 0) return 'yellow'
  return 'green'
}

const loadOptions = async () => {
  const [deptRes, postRes] = await Promise.allSettled([getDeptTreeOptions(), getPostOptions()])
  deptOptions.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
  postOptions.value = postRes.status === 'fulfilled' ? normalizeRows<PostOption>(postRes.value) : []
}

const loadData = async () => {
  loading.value = true
  try {
    headcounts.value = normalizeRows<Headcount>(await listHeadcounts())
    if (!selectedHeadcount.value && headcounts.value.length) await selectHeadcount(headcounts.value[0])
  } catch (error) {
    toast.error(getErrorMessage(error, '编制数据加载失败'))
  } finally {
    loading.value = false
  }
}

const selectHeadcount = async (item: Headcount) => {
  selectedHeadcount.value = item
  try {
    statistics.value = await getHeadcountStatistics(item.targetType, item.targetId)
  } catch {
    statistics.value = null
  }
}

const openDialog = (item?: Headcount) => {
  form.value = {
    targetType: item?.targetType || 'DEPT',
    targetId: String(item?.targetId || ''),
    approvedCount: String(item?.approvedCount ?? 1),
    actualCount: String(item?.actualCount ?? 0),
    effectiveDate: formatDate(item?.effectiveDate, todayValue()),
    expiryDate: formatDate(item?.expiryDate, '')
  }
  dialogOpen.value = true
}

const handleSave = async () => {
  submitting.value = true
  try {
    const targetType = form.value.targetType
    const targetId = Number(form.value.targetId)
    await setHeadcount({
      targetType,
      targetId,
      approvedCount: Number(form.value.approvedCount || 0),
      effectiveDate: form.value.effectiveDate || undefined,
      expiryDate: form.value.expiryDate || undefined
    })
    if (form.value.actualCount !== '') {
      await updateHeadcountActualCount(targetType, targetId, Number(form.value.actualCount || 0))
    }
    dialogOpen.value = false
    toast.success('保存成功')
    await loadData()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
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
          <Layers3 class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Headcount Control
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">编制管理</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="loadData"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新</Button>
        <Button @click="openDialog()"><Plus class="h-4 w-4" />设置编制</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">核定编制</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.approved) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">实际在职</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.actual) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">空缺人数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.vacancy) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">超编对象</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.overstaffed) }}</div></div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <Panel title="编制清单">
        <template #icon><Target class="h-4 w-4 text-slate-500" /></template>
        <div class="mb-4 max-w-md"><Input v-model="keyword" placeholder="搜索部门、岗位、类型" /></div>
        <DataTable :columns="columns" :data="filteredHeadcounts" :loading="loading" row-key="id">
          <template #cell-targetName="{ row }">
            <button type="button" class="text-left" @click="selectHeadcount(row)">
              <div class="font-semibold">{{ row.targetName || row.targetId }}</div>
              <div class="text-xs text-slate-500">{{ row.targetType === 'DEPT' ? '部门' : '岗位' }}</div>
            </button>
          </template>
          <template #cell-vacancyCount="{ row }"><StatusBadge :label="String(row.vacancyCount ?? 0)" :tone="vacancyTone(row)" /></template>
          <template #cell-effectiveDate="{ row }">{{ formatDate(row.effectiveDate) }} ~ {{ formatDate(row.expiryDate, '长期有效') }}</template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="sm" :variant="selectedHeadcount?.id === row.id ? 'primary' : 'outline'" @click="selectHeadcount(row)">详情</Button>
              <Button size="icon" variant="ghost" @click="openDialog(row)"><Save class="h-4 w-4" /></Button>
            </div>
          </template>
        </DataTable>
      </Panel>

      <Panel title="编制详情">
        <template #icon><BarChart3 class="h-4 w-4 text-slate-500" /></template>
        <div v-if="selectedHeadcount" class="space-y-3">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ selectedHeadcount.targetName || selectedHeadcount.targetId }}</div>
            <div class="mt-1 text-xs text-slate-500">{{ selectedHeadcount.targetType }} · {{ formatDate(selectedHeadcount.effectiveDate) }}</div>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="card p-3"><div class="text-xs text-slate-500">核定</div><div class="mt-1 text-xl font-semibold">{{ statistics?.approvedCount ?? selectedHeadcount.approvedCount }}</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">实际</div><div class="mt-1 text-xl font-semibold">{{ statistics?.actualCount ?? selectedHeadcount.actualCount }}</div></div>
            <div class="card p-3"><div class="text-xs text-slate-500">利用率</div><div class="mt-1 text-xl font-semibold">{{ statistics?.utilizationRate ?? '-' }}</div></div>
          </div>
          <StatusBadge :label="(statistics?.isOverstaffed || Number(selectedHeadcount.vacancyCount) < 0) ? '超编' : '正常'" :tone="(statistics?.isOverstaffed || Number(selectedHeadcount.vacancyCount) < 0) ? 'red' : statusTone('ACTIVE')" />
        </div>
        <div v-else class="py-12 text-center text-sm text-slate-500">请选择编制记录</div>
      </Panel>
    </div>

    <BaseDialog :show="dialogOpen" title="设置编制" width="wide" @close="dialogOpen = false">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">对象类型</span><Select v-model="form.targetType" :options="targetTypeOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">对象</span><Select v-model="form.targetId" :options="targetOptions" searchable /></label>
        <Input v-model="form.approvedCount" label="核定编制" type="number" />
        <Input v-model="form.actualCount" label="实际人数" type="number" />
        <Input v-model="form.effectiveDate" label="生效日期" type="date" />
        <Input v-model="form.expiryDate" label="失效日期" type="date" />
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
