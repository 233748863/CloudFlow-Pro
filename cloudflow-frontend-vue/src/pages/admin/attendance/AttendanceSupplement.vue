<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  CalendarClock,
  ClipboardCheck,
  Edit,
  Eye,
  Plus,
  RotateCcw,
  Send,
  Trash2
} from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Pagination,
  Select,
  StatusBadge,
  TextArea,
  type Column,
  type SelectOption
} from '@/components/common'
import {
  type AttendanceSupplement,
  type AttendanceSupplementForm,
  type HrEmployee,
  createAttendanceSupplement,
  deleteAttendanceSupplement,
  getAttendanceSupplement,
  getHrSelfServiceRestrictionMessage,
  listAttendanceSupplements,
  resolveCurrentEmployee,
  submitAttendanceSupplement,
  updateAttendanceSupplement
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

type ConfirmState = {
  type: 'delete' | 'submit'
  id: number
  title: string
  message: string
  confirmText: string
  danger?: boolean
}

const STATUS_LABEL: Record<string, string> = {
  MISSING: '草稿',
  APPROVING: '审批中',
  SUPPLEMENT: '已补录',
  REJECTED: '已驳回'
}

const CHECK_TYPE_LABEL: Record<string, string> = {
  CHECK_IN: '签到',
  CHECK_OUT: '签退'
}

const statusTone = (status?: string): 'slate' | 'green' | 'red' | 'yellow' | 'cyan' => {
  switch (status) {
    case 'MISSING':
      return 'slate'
    case 'APPROVING':
      return 'cyan'
    case 'SUPPLEMENT':
      return 'green'
    case 'REJECTED':
      return 'red'
    default:
      return 'slate'
  }
}

const emptyForm = (): AttendanceSupplementForm => ({
  attendanceDate: '',
  checkType: 'CHECK_IN',
  checkTime: '09:00',
  reason: ''
})

const toTimeValue = (value?: string) => {
  if (!value) return ''
  const matched = value.match(/(\d{2}:\d{2})/)
  return matched ? matched[1] : value
}

const formatDateTime = (value?: string) => value ? value.replace('T', ' ').slice(0, 19) : '-'

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const detailLoading = ref(false)
const employee = ref<HrEmployee | null>(null)
const list = ref<AttendanceSupplement[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const statusFilter = ref('')
const checkTypeFilter = ref('')
const showForm = ref(false)
const showDetail = ref(false)
const current = ref<AttendanceSupplement | null>(null)
const detail = ref<AttendanceSupplement | null>(null)
const form = ref<AttendanceSupplementForm>(emptyForm())
const confirmState = ref<ConfirmState | null>(null)

const columns: Column<AttendanceSupplement>[] = [
  { key: 'supplementNo', label: '补录单号' },
  { key: 'attendanceDate', label: '补录日期', sortable: true },
  { key: 'checkType', label: '类型' },
  { key: 'checkTime', label: '补录时间' },
  { key: 'reason', label: '原因' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'MISSING', label: '草稿' },
  { value: 'APPROVING', label: '审批中' },
  { value: 'SUPPLEMENT', label: '已补录' },
  { value: 'REJECTED', label: '已驳回' }
]

const checkTypeOptions: SelectOption[] = [
  { value: '', label: '全部类型' },
  { value: 'CHECK_IN', label: '签到' },
  { value: 'CHECK_OUT', label: '签退' }
]

const formCheckTypeOptions: SelectOption[] = [
  { value: 'CHECK_IN', label: '签到' },
  { value: 'CHECK_OUT', label: '签退' }
]

const selfServiceRestriction = computed(() => getHrSelfServiceRestrictionMessage(employee.value))
const selfServiceLocked = computed(() => loading.value || saving.value || Boolean(selfServiceRestriction.value))
const draftCount = computed(() => list.value.filter((item) => item.status === 'MISSING').length)
const pendingCount = computed(() => list.value.filter((item) => item.status === 'APPROVING').length)
const approvedCount = computed(() => list.value.filter((item) => item.status === 'SUPPLEMENT').length)

const fetchList = async () => {
  loading.value = true
  try {
    if (!employee.value) employee.value = await resolveCurrentEmployee()
    const page = await listAttendanceSupplements({
      employeeId: employee.value.id,
      status: statusFilter.value,
      checkType: checkTypeFilter.value,
      pageNum: pageNum.value,
      pageSize: pageSize.value
    })
    list.value = page.records || page.rows || []
    total.value = page.total || 0
  } catch (error) {
    toast.error(getErrorMessage(error, '获取补卡申请失败'))
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  statusFilter.value = ''
  checkTypeFilter.value = ''
  pageNum.value = 1
  void fetchList()
}

const openAdd = () => {
  if (selfServiceRestriction.value) {
    toast.error(selfServiceRestriction.value)
    return
  }
  current.value = null
  form.value = emptyForm()
  showForm.value = true
}

const openEdit = async (id?: number) => {
  if (!id) return
  if (selfServiceRestriction.value) {
    toast.error(selfServiceRestriction.value)
    return
  }
  try {
    const item = await getAttendanceSupplement(id)
    current.value = item
    form.value = {
      id: item.id,
      attendanceDate: item.attendanceDate,
      checkType: item.checkType,
      checkTime: toTimeValue(item.checkTime),
      reason: item.reason
    }
    showForm.value = true
  } catch (error) {
    toast.error(getErrorMessage(error, '获取补卡详情失败'))
  }
}

const openDetail = async (id?: number) => {
  if (!id) return
  showDetail.value = true
  detail.value = null
  detailLoading.value = true
  try {
    detail.value = await getAttendanceSupplement(id)
  } catch (error) {
    showDetail.value = false
    toast.error(getErrorMessage(error, '获取补卡详情失败'))
  } finally {
    detailLoading.value = false
  }
}

const closeForm = () => {
  showForm.value = false
  current.value = null
  form.value = emptyForm()
}

const saveForm = async () => {
  if (selfServiceRestriction.value) {
    toast.error(selfServiceRestriction.value)
    return
  }
  if (!form.value.attendanceDate || !form.value.checkTime || !form.value.reason.trim()) {
    toast.error('请完整填写补卡信息')
    return
  }
  saving.value = true
  try {
    if (current.value?.id) {
      await updateAttendanceSupplement(current.value.id, form.value)
      toast.success('补卡申请已更新')
    } else {
      await createAttendanceSupplement(form.value)
      toast.success('补卡申请已创建')
    }
    closeForm()
    await fetchList()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存补卡申请失败'))
  } finally {
    saving.value = false
  }
}

const openSubmitConfirm = (id?: number) => {
  if (!id) return
  if (selfServiceRestriction.value) {
    toast.error(selfServiceRestriction.value)
    return
  }
  confirmState.value = {
    type: 'submit',
    id,
    title: '提交补卡申请',
    message: '提交后将进入审批流程。',
    confirmText: '提交'
  }
}

const openDeleteConfirm = (id?: number) => {
  if (!id) return
  if (selfServiceRestriction.value) {
    toast.error(selfServiceRestriction.value)
    return
  }
  confirmState.value = {
    type: 'delete',
    id,
    title: '删除补卡申请',
    message: '删除后当前草稿不可恢复。',
    confirmText: '删除',
    danger: true
  }
}

const handleConfirm = async () => {
  if (!confirmState.value) return
  const state = confirmState.value
  confirmState.value = null
  try {
    if (state.type === 'submit') {
      await submitAttendanceSupplement(state.id)
      toast.success('补卡申请已提交')
    } else {
      await deleteAttendanceSupplement(state.id)
      toast.success('补卡申请已删除')
    }
    await fetchList()
  } catch (error) {
    toast.error(getErrorMessage(error, state.type === 'submit' ? '提交失败' : '删除失败'))
  }
}

onMounted(() => {
  void fetchList()
})
</script>

<template>
  <div class="space-y-5">
    <div class="page-header">
      <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-dark-400">
        <CalendarClock class="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
        Attendance Supplements
      </div>
      <h1 class="page-title mt-1.5">补卡申请</h1>
      <p class="page-description">草稿 {{ draftCount }} · 审批中 {{ pendingCount }} · 已补录 {{ approvedCount }}</p>
    </div>

    <div v-if="selfServiceRestriction" class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ selfServiceRestriction }}</span>
    </div>

    <section class="card overflow-hidden">
      <div class="card-header flex flex-wrap items-center gap-3">
        <div class="flex flex-1 flex-wrap items-center gap-3">
          <div class="w-full sm:w-44">
            <Select v-model="statusFilter" :options="statusOptions" @change="pageNum = 1; fetchList()" />
          </div>
          <div class="w-full sm:w-44">
            <Select v-model="checkTypeFilter" :options="checkTypeOptions" @change="pageNum = 1; fetchList()" />
          </div>
          <span class="text-xs text-gray-500 dark:text-dark-400">共 {{ total }} 条</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" @click="resetFilters">
            <RotateCcw class="h-3.5 w-3.5" />
            清空条件
          </Button>
          <Button size="sm" :disabled="selfServiceLocked" @click="openAdd">
            <Plus class="h-3.5 w-3.5" />
            新建申请
          </Button>
        </div>
      </div>

      <div class="p-4">
        <DataTable :columns="columns" :data="list" :loading="loading" row-key="id">
          <template #cell-supplementNo="{ row }">
            <span class="font-medium text-gray-900 dark:text-white">{{ row.supplementNo || `ATTENDANCE-${row.id}` }}</span>
          </template>
          <template #cell-checkType="{ row }">{{ CHECK_TYPE_LABEL[row.checkType] || row.checkType }}</template>
          <template #cell-checkTime="{ row }">{{ toTimeValue(row.checkTime) || '-' }}</template>
          <template #cell-reason="{ row }">
            <span class="block max-w-[240px] truncate">{{ row.reason || '-' }}</span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :label="STATUS_LABEL[row.status || ''] || row.status || '-'" :tone="statusTone(row.status)" />
          </template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button variant="ghost" size="icon" title="详情" @click="openDetail(row.id)">
                <Eye class="h-4 w-4" />
              </Button>
              <Button v-if="row.status === 'MISSING' || row.status === 'REJECTED'" variant="ghost" size="icon" title="编辑" :disabled="selfServiceLocked" @click="openEdit(row.id)">
                <Edit class="h-4 w-4" />
              </Button>
              <Button v-if="row.status === 'MISSING'" variant="ghost" size="icon" title="提交" :disabled="selfServiceLocked" @click="openSubmitConfirm(row.id)">
                <Send class="h-4 w-4" />
              </Button>
              <Button v-if="row.status === 'MISSING' || row.status === 'REJECTED'" variant="ghost" size="icon" title="删除" :disabled="selfServiceLocked" @click="openDeleteConfirm(row.id)">
                <Trash2 class="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </template>
        </DataTable>
      </div>

      <Pagination
        v-if="total > 0"
        v-model:page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :show-jump="false"
        @update:page="fetchList"
        @update:page-size="pageNum = 1; fetchList()"
      />
    </section>

    <BaseDialog :show="showForm" :title="current ? '编辑补卡申请' : '新建补卡申请'" width="wide" @close="closeForm">
      <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-3">
          <Input v-model="form.attendanceDate" type="date" label="补卡日期" required />
          <label class="space-y-2">
            <span class="input-label">打卡类型</span>
            <Select v-model="form.checkType" :options="formCheckTypeOptions" />
          </label>
          <Input v-model="form.checkTime" type="time" label="补卡时间" required />
        </div>
        <TextArea v-model="form.reason" label="补卡原因" required :rows="5" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeForm">取消</Button>
          <Button :disabled="saving" @click="saveForm">{{ saving ? '保存中...' : '保存' }}</Button>
        </div>
      </template>
    </BaseDialog>

    <BaseDialog :show="showDetail" :title="detail?.supplementNo || '补卡详情'" width="wide" @close="showDetail = false">
      <div v-if="detailLoading" class="empty-state">
        <ClipboardCheck class="empty-state-icon animate-pulse" />
        <div class="empty-state-title">正在加载详情</div>
      </div>
      <div v-else-if="detail" class="space-y-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70">
            <div class="text-xs text-gray-500 dark:text-dark-400">补录单号</div>
            <div class="mt-1 font-medium text-gray-900 dark:text-white">{{ detail.supplementNo || `ATTENDANCE-${detail.id}` }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70">
            <div class="text-xs text-gray-500 dark:text-dark-400">申请人</div>
            <div class="mt-1 font-medium text-gray-900 dark:text-white">{{ detail.employeeName || '-' }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70">
            <div class="text-xs text-gray-500 dark:text-dark-400">状态</div>
            <div class="mt-1"><StatusBadge :label="STATUS_LABEL[detail.status || ''] || detail.status || '-'" :tone="statusTone(detail.status)" /></div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70">
            <div class="text-xs text-gray-500 dark:text-dark-400">补卡日期</div>
            <div class="mt-1 font-medium text-gray-900 dark:text-white">{{ detail.attendanceDate }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70">
            <div class="text-xs text-gray-500 dark:text-dark-400">类型</div>
            <div class="mt-1 font-medium text-gray-900 dark:text-white">{{ CHECK_TYPE_LABEL[detail.checkType] || detail.checkType }}</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70">
            <div class="text-xs text-gray-500 dark:text-dark-400">补卡时间</div>
            <div class="mt-1 font-medium text-gray-900 dark:text-white">{{ formatDateTime(detail.checkTime) }}</div>
          </div>
        </div>
        <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-dark-700 dark:bg-dark-900/70">
          <div class="text-sm font-medium text-gray-900 dark:text-white">补卡原因</div>
          <div class="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{{ detail.reason || '-' }}</div>
        </div>
        <div v-if="detail.processInstanceId" class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm dark:border-dark-700 dark:bg-dark-900/70">
          <div class="text-xs text-gray-500 dark:text-dark-400">流程实例</div>
          <div class="mt-1 font-mono text-gray-900 dark:text-white">{{ detail.processInstanceId }}</div>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end">
          <Button variant="outline" @click="showDetail = false">关闭</Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(confirmState)"
      :title="confirmState?.title || '确认操作'"
      :message="confirmState?.message || ''"
      :confirm-text="confirmState?.confirmText || '确定'"
      :danger="confirmState?.danger"
      @confirm="handleConfirm"
      @cancel="confirmState = null"
    />
  </div>
</template>
