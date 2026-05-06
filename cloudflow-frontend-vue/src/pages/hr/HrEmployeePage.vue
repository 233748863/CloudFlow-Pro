<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  BadgeDollarSign,
  ContactRound,
  Edit3,
  FileText,
  IdCard,
  Landmark,
  Phone,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  Users
} from 'lucide-vue-next'
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
  type EmergencyContact,
  type EmployeeContract,
  type EmployeeDocument,
  type EmployeeInsuranceDetail,
  type EmployeeSalaryDetail,
  type EmployeeTaxDeduction,
  type HrEmployee,
  type HrEmployeePayload,
  type PositionOption,
  type PostOption,
  createEmergencyContact,
  createEmployee,
  createEmployeeContract,
  createEmployeeDocument,
  deleteEmergencyContact,
  deleteEmployee,
  deleteEmployeeContract,
  deleteEmployeeDocument,
  getDeptTreeOptions,
  getEmployeeDetail,
  getEmployeeInsurance,
  getEmployeeSalary,
  getPositionOptions,
  getPostOptions,
  listEmergencyContacts,
  listEmployeeContracts,
  listEmployeeDocuments,
  listEmployees,
  listTaxDeductions,
  updateEmergencyContact,
  updateEmployee,
  updateEmployeeContract,
  updateEmployeeDocument
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  buildEmployeeLabel,
  contractStatusLabel,
  contractTypeLabel,
  documentTypeLabel,
  employeeStatusLabel,
  employeeTypeLabel,
  flattenDeptTree,
  formatCurrency,
  formatDate,
  joinAttachmentText,
  normalizeRows,
  parseAttachmentText,
  relationshipLabel,
  statusTone,
  todayValue,
  toDateInputValue
} from './hrUtils'

type WorkspaceTab = 'contracts' | 'documents' | 'contacts' | 'salary' | 'insurance' | 'tax'
type DialogMode = 'employee' | 'contract' | 'document' | 'contact' | null
type DeleteTarget =
  | { kind: 'employee'; id: number; label: string }
  | { kind: 'contract'; id: number; label: string }
  | { kind: 'document'; id: number; label: string }
  | { kind: 'contact'; id: number; label: string }

const toast = useToastStore()
const loading = ref(false)
const detailLoading = ref(false)
const submitting = ref(false)
const keyword = ref('')
const statusFilter = ref('ALL')
const employees = ref<HrEmployee[]>([])
const selectedEmployeeId = ref<number | null>(null)
const selectedEmployee = ref<HrEmployee | null>(null)
const deptOptions = ref<DeptTreeNode[]>([])
const postOptions = ref<PostOption[]>([])
const positionOptions = ref<PositionOption[]>([])
const contracts = ref<EmployeeContract[]>([])
const documents = ref<EmployeeDocument[]>([])
const contacts = ref<EmergencyContact[]>([])
const salaryDetail = ref<EmployeeSalaryDetail | null>(null)
const insuranceDetail = ref<EmployeeInsuranceDetail | null>(null)
const taxDeductions = ref<EmployeeTaxDeduction[]>([])
const activeTab = ref<WorkspaceTab>('contracts')
const dialogMode = ref<DialogMode>(null)
const editingId = ref<number | null>(null)
const pendingDelete = ref<DeleteTarget | null>(null)

const employeeForm = ref<HrEmployeePayload>({
  employeeNo: '',
  name: '',
  gender: 'MALE',
  employeeType: 'FULL_TIME',
  employeeStatus: 'PROBATION',
  hireDate: todayValue()
})

const contractForm = ref({
  contractType: 'LABOR',
  contractNo: '',
  signDate: todayValue(),
  startDate: todayValue(),
  endDate: '',
  duration: '',
  attachmentValue: '',
  status: 'DRAFT'
})

const documentForm = ref({
  documentType: 'ID_CARD',
  documentNo: '',
  issueDate: '',
  expiryDate: '',
  attachmentValue: ''
})

const contactForm = ref({
  contactName: '',
  relationship: 'PARENT',
  phone: '',
  address: '',
  priority: '1'
})

const employeeColumns: Column<HrEmployee>[] = [
  { key: 'employeeNo', label: '工号', sortable: true },
  { key: 'name', label: '员工信息' },
  { key: 'deptName', label: '组织岗位' },
  { key: 'employeeStatus', label: '状态' },
  { key: 'hireDate', label: '入职日期', sortable: true },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const contractColumns: Column<EmployeeContract>[] = [
  { key: 'contractNo', label: '合同编号' },
  { key: 'contractType', label: '类型' },
  { key: 'startDate', label: '周期' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const documentColumns: Column<EmployeeDocument>[] = [
  { key: 'documentNo', label: '证件号码' },
  { key: 'documentType', label: '类型' },
  { key: 'expiryDate', label: '有效期' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const contactColumns: Column<EmergencyContact>[] = [
  { key: 'contactName', label: '姓名' },
  { key: 'relationship', label: '关系' },
  { key: 'phone', label: '电话' },
  { key: 'priority', label: '优先级' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const taxColumns: Column<EmployeeTaxDeduction>[] = [
  { key: 'deductionType', label: '扣除类型' },
  { key: 'amount', label: '月扣除额' },
  { key: 'startDate', label: '周期' },
  { key: 'status', label: '状态' }
]

const genderOptions: SelectOption[] = [
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' }
]

const employeeTypeOptions: SelectOption[] = [
  { value: 'FULL_TIME', label: '全职' },
  { value: 'PART_TIME', label: '兼职' },
  { value: 'INTERN', label: '实习生' },
  { value: 'CONTRACTOR', label: '外包' }
]

const employeeStatusOptions: SelectOption[] = [
  { value: 'ALL', label: '全部状态' },
  { value: 'PENDING', label: '待入职' },
  { value: 'PROBATION', label: '试用期' },
  { value: 'REGULAR', label: '正式员工' },
  { value: 'RESIGNED', label: '已离职' }
]

const formStatusOptions = employeeStatusOptions.filter((item) => item.value !== 'ALL')

const contractTypeOptions: SelectOption[] = [
  { value: 'LABOR', label: '劳动合同' },
  { value: 'SERVICE', label: '劳务合同' },
  { value: 'INTERN', label: '实习协议' }
]

const contractStatusOptions: SelectOption[] = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'ACTIVE', label: '生效中' },
  { value: 'EXPIRED', label: '已过期' },
  { value: 'TERMINATED', label: '已终止' }
]

const documentTypeOptions: SelectOption[] = [
  { value: 'ID_CARD', label: '身份证' },
  { value: 'PASSPORT', label: '护照' },
  { value: 'DIPLOMA', label: '学历证书' },
  { value: 'DEGREE', label: '学位证书' }
]

const relationshipOptions: SelectOption[] = [
  { value: 'SPOUSE', label: '配偶' },
  { value: 'PARENT', label: '父母' },
  { value: 'SIBLING', label: '兄弟姐妹' },
  { value: 'CHILD', label: '子女' },
  { value: 'OTHER', label: '其他' }
]

const deptSelectOptions = computed<SelectOption[]>(() =>
  flattenDeptTree(deptOptions.value).map((item) => ({ value: item.deptId, label: item.deptName }))
)

const postSelectOptions = computed<SelectOption[]>(() =>
  postOptions.value.map((item) => ({ value: item.postId, label: item.postName }))
)

const positionSelectOptions = computed<SelectOption[]>(() =>
  positionOptions.value.map((item) => ({ value: item.id, label: item.positionName }))
)

const filteredEmployees = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return employees.value.filter((item) => {
    const matchesStatus = statusFilter.value === 'ALL' || item.employeeStatus === statusFilter.value
    const text = [item.employeeNo, item.name, item.deptName, item.postName, item.positionName, item.phone, item.email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return matchesStatus && (!query || text.includes(query))
  })
})

const summary = computed(() => ({
  total: employees.value.length,
  filtered: filteredEmployees.value.length,
  probation: employees.value.filter((item) => item.employeeStatus === 'PROBATION').length,
  regular: employees.value.filter((item) => item.employeeStatus === 'REGULAR').length,
  resigned: employees.value.filter((item) => item.employeeStatus === 'RESIGNED').length
}))

const loadOptions = async () => {
  const [deptRes, postRes, positionRes] = await Promise.allSettled([
    getDeptTreeOptions(),
    getPostOptions(),
    getPositionOptions()
  ])
  deptOptions.value = deptRes.status === 'fulfilled' ? normalizeRows<DeptTreeNode>(deptRes.value) : []
  postOptions.value = postRes.status === 'fulfilled' ? normalizeRows<PostOption>(postRes.value) : []
  positionOptions.value = positionRes.status === 'fulfilled' ? normalizeRows<PositionOption>(positionRes.value) : []
}

const loadEmployees = async () => {
  loading.value = true
  try {
    const rows = await listEmployees()
    employees.value = normalizeRows<HrEmployee>(rows)
    if (!selectedEmployeeId.value && employees.value[0]) selectedEmployeeId.value = employees.value[0].id
  } catch (error) {
    toast.error(getErrorMessage(error, '员工列表加载失败'))
  } finally {
    loading.value = false
  }
}

const loadWorkspace = async (employeeId: number) => {
  detailLoading.value = true
  try {
    const [detailRes, contractRes, documentRes, contactRes, salaryRes, insuranceRes, taxRes] = await Promise.allSettled([
      getEmployeeDetail(employeeId),
      listEmployeeContracts(employeeId),
      listEmployeeDocuments(employeeId),
      listEmergencyContacts(employeeId),
      getEmployeeSalary(employeeId),
      getEmployeeInsurance(employeeId),
      listTaxDeductions(employeeId)
    ])
    selectedEmployee.value = detailRes.status === 'fulfilled' ? detailRes.value : employees.value.find((item) => item.id === employeeId) || null
    contracts.value = contractRes.status === 'fulfilled' ? normalizeRows<EmployeeContract>(contractRes.value) : []
    documents.value = documentRes.status === 'fulfilled' ? normalizeRows<EmployeeDocument>(documentRes.value) : []
    contacts.value = contactRes.status === 'fulfilled' ? normalizeRows<EmergencyContact>(contactRes.value) : []
    salaryDetail.value = salaryRes.status === 'fulfilled' ? salaryRes.value : null
    insuranceDetail.value = insuranceRes.status === 'fulfilled' ? insuranceRes.value : null
    taxDeductions.value = taxRes.status === 'fulfilled' ? normalizeRows<EmployeeTaxDeduction>(taxRes.value) : []
  } catch (error) {
    toast.error(getErrorMessage(error, '员工详情加载失败'))
  } finally {
    detailLoading.value = false
  }
}

const resetEmployeeForm = () => {
  editingId.value = null
  employeeForm.value = {
    employeeNo: '',
    name: '',
    gender: 'MALE',
    employeeType: 'FULL_TIME',
    employeeStatus: 'PROBATION',
    hireDate: todayValue()
  }
}

const openCreateEmployee = () => {
  resetEmployeeForm()
  dialogMode.value = 'employee'
}

const openEditEmployee = async (id: number) => {
  try {
    const detail = await getEmployeeDetail(id)
    editingId.value = id
    employeeForm.value = {
      employeeNo: detail.employeeNo,
      name: detail.name,
      gender: detail.gender || 'MALE',
      birthDate: toDateInputValue(detail.birthDate) || null,
      phone: detail.phone || null,
      email: detail.email || null,
      deptId: detail.deptId || null,
      postId: detail.postId || null,
      positionId: detail.positionId || null,
      employeeType: detail.employeeType || 'FULL_TIME',
      employeeStatus: detail.employeeStatus,
      hireDate: toDateInputValue(detail.hireDate) || null,
      regularDate: toDateInputValue(detail.regularDate) || null,
      resignDate: toDateInputValue(detail.resignDate) || null,
      userId: detail.userId || null
    }
    dialogMode.value = 'employee'
  } catch (error) {
    toast.error(getErrorMessage(error, '员工详情获取失败'))
  }
}

const handleSaveEmployee = async () => {
  if (!employeeForm.value.employeeNo.trim() || !employeeForm.value.name.trim()) {
    toast.error('请填写工号和姓名')
    return
  }
  submitting.value = true
  try {
    const payload = { ...employeeForm.value }
    if (editingId.value) {
      await updateEmployee(editingId.value, payload)
      toast.success('员工档案已更新')
    } else {
      const id = await createEmployee(payload)
      selectedEmployeeId.value = id
      toast.success('员工档案已创建')
    }
    dialogMode.value = null
    resetEmployeeForm()
    await loadEmployees()
    if (selectedEmployeeId.value) await loadWorkspace(selectedEmployeeId.value)
  } catch (error) {
    toast.error(getErrorMessage(error, '保存员工失败'))
  } finally {
    submitting.value = false
  }
}

const openContractDialog = (item?: EmployeeContract) => {
  editingId.value = item?.id || null
  contractForm.value = {
    contractType: item?.contractType || 'LABOR',
    contractNo: item?.contractNo || '',
    signDate: toDateInputValue(item?.signDate) || todayValue(),
    startDate: toDateInputValue(item?.startDate) || todayValue(),
    endDate: toDateInputValue(item?.endDate) || '',
    duration: item?.duration == null ? '' : String(item.duration),
    attachmentValue: joinAttachmentText(item?.attachmentUrls),
    status: item?.status || 'DRAFT'
  }
  dialogMode.value = 'contract'
}

const openDocumentDialog = (item?: EmployeeDocument) => {
  editingId.value = item?.id || null
  documentForm.value = {
    documentType: item?.documentType || 'ID_CARD',
    documentNo: item?.documentNo || '',
    issueDate: toDateInputValue(item?.issueDate) || '',
    expiryDate: toDateInputValue(item?.expiryDate) || '',
    attachmentValue: joinAttachmentText(item?.attachmentUrls)
  }
  dialogMode.value = 'document'
}

const openContactDialog = (item?: EmergencyContact) => {
  editingId.value = item?.id || null
  contactForm.value = {
    contactName: item?.contactName || '',
    relationship: item?.relationship || 'PARENT',
    phone: item?.phone || '',
    address: item?.address || '',
    priority: item?.priority == null ? '1' : String(item.priority)
  }
  dialogMode.value = 'contact'
}

const requireEmployeeId = () => {
  if (!selectedEmployeeId.value) {
    toast.error('请先选择员工')
    return null
  }
  return selectedEmployeeId.value
}

const handleSaveContract = async () => {
  const employeeId = requireEmployeeId()
  if (!employeeId) return
  if (!contractForm.value.contractNo.trim() || !contractForm.value.endDate) {
    toast.error('请填写合同编号和结束日期')
    return
  }
  submitting.value = true
  try {
    const payload = {
      employeeId,
      contractType: contractForm.value.contractType,
      contractNo: contractForm.value.contractNo.trim(),
      signDate: contractForm.value.signDate,
      startDate: contractForm.value.startDate,
      endDate: contractForm.value.endDate,
      duration: contractForm.value.duration ? Number(contractForm.value.duration) : null,
      attachmentUrls: parseAttachmentText(contractForm.value.attachmentValue),
      status: contractForm.value.status
    }
    if (editingId.value) await updateEmployeeContract(editingId.value, payload)
    else await createEmployeeContract(payload)
    toast.success('合同已保存')
    dialogMode.value = null
    await loadWorkspace(employeeId)
  } catch (error) {
    toast.error(getErrorMessage(error, '保存合同失败'))
  } finally {
    submitting.value = false
  }
}

const handleSaveDocument = async () => {
  const employeeId = requireEmployeeId()
  if (!employeeId) return
  if (!documentForm.value.documentNo.trim()) {
    toast.error('请填写证件号码')
    return
  }
  submitting.value = true
  try {
    const payload = {
      employeeId,
      documentType: documentForm.value.documentType,
      documentNo: documentForm.value.documentNo.trim(),
      issueDate: documentForm.value.issueDate || null,
      expiryDate: documentForm.value.expiryDate || null,
      attachmentUrls: parseAttachmentText(documentForm.value.attachmentValue)
    }
    if (editingId.value) await updateEmployeeDocument(editingId.value, payload)
    else await createEmployeeDocument(payload)
    toast.success('证件已保存')
    dialogMode.value = null
    await loadWorkspace(employeeId)
  } catch (error) {
    toast.error(getErrorMessage(error, '保存证件失败'))
  } finally {
    submitting.value = false
  }
}

const handleSaveContact = async () => {
  const employeeId = requireEmployeeId()
  if (!employeeId) return
  if (!contactForm.value.contactName.trim() || !contactForm.value.phone.trim()) {
    toast.error('请填写联系人姓名和电话')
    return
  }
  submitting.value = true
  try {
    const payload = {
      employeeId,
      contactName: contactForm.value.contactName.trim(),
      relationship: contactForm.value.relationship,
      phone: contactForm.value.phone.trim(),
      address: contactForm.value.address || null,
      priority: Number(contactForm.value.priority || 1)
    }
    if (editingId.value) await updateEmergencyContact(editingId.value, payload)
    else await createEmergencyContact(payload)
    toast.success('联系人已保存')
    dialogMode.value = null
    await loadWorkspace(employeeId)
  } catch (error) {
    toast.error(getErrorMessage(error, '保存联系人失败'))
  } finally {
    submitting.value = false
  }
}

const handleDialogSave = () => {
  if (dialogMode.value === 'employee') void handleSaveEmployee()
  if (dialogMode.value === 'contract') void handleSaveContract()
  if (dialogMode.value === 'document') void handleSaveDocument()
  if (dialogMode.value === 'contact') void handleSaveContact()
}

const handleConfirmDelete = async () => {
  if (!pendingDelete.value) return
  const target = pendingDelete.value
  submitting.value = true
  try {
    if (target.kind === 'employee') await deleteEmployee(target.id)
    if (target.kind === 'contract') await deleteEmployeeContract(target.id)
    if (target.kind === 'document') await deleteEmployeeDocument(target.id)
    if (target.kind === 'contact') await deleteEmergencyContact(target.id)
    toast.success('已删除')
    pendingDelete.value = null
    if (target.kind === 'employee') {
      selectedEmployeeId.value = null
      selectedEmployee.value = null
      await loadEmployees()
    } else if (selectedEmployeeId.value) {
      await loadWorkspace(selectedEmployeeId.value)
    }
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    submitting.value = false
  }
}

watch(selectedEmployeeId, (id) => {
  if (id) void loadWorkspace(id)
})

onMounted(async () => {
  await Promise.all([loadOptions(), loadEmployees()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <UserRound class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Employee Archive
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">员工档案</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="loadEmployees">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新
        </Button>
        <Button @click="openCreateEmployee">
          <Plus class="h-4 w-4" />
          新建员工
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">员工总数</div><div class="mt-2 text-2xl font-semibold">{{ summary.total }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">当前筛选</div><div class="mt-2 text-2xl font-semibold">{{ summary.filtered }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">试用期</div><div class="mt-2 text-2xl font-semibold">{{ summary.probation }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">正式员工</div><div class="mt-2 text-2xl font-semibold">{{ summary.regular }}</div></div>
    </div>

    <div class="card overflow-hidden">
      <div class="border-b border-slate-200 p-4 dark:border-slate-800">
        <div class="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
          <Input v-model="keyword" placeholder="按姓名、工号、部门、岗位搜索" />
          <Select v-model="statusFilter" :options="employeeStatusOptions" />
          <Button variant="outline" @click="keyword = ''; statusFilter = 'ALL'">重置</Button>
        </div>
      </div>

      <div class="grid min-h-[720px] xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.95fr)]">
        <div class="min-w-0 xl:border-r xl:border-slate-200 dark:xl:border-slate-800">
          <DataTable :columns="employeeColumns" :data="filteredEmployees" :loading="loading" row-key="id">
            <template #cell-name="{ row }">
              <button type="button" class="text-left" @click="selectedEmployeeId = row.id">
                <div class="font-semibold text-slate-900 dark:text-slate-100">{{ row.name }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ row.phone || row.email || '暂无联系方式' }}</div>
              </button>
            </template>
            <template #cell-deptName="{ row }">
              <div>{{ row.deptName || '未分配部门' }}</div>
              <div class="mt-1 text-xs text-slate-500">{{ [row.postName, row.positionName].filter(Boolean).join(' / ') || '未配置岗位' }}</div>
            </template>
            <template #cell-employeeStatus="{ row }">
              <div class="flex flex-wrap gap-1.5">
                <StatusBadge :label="employeeTypeLabel[row.employeeType || ''] || row.employeeType || '未知'" tone="cyan" />
                <StatusBadge :label="employeeStatusLabel[row.employeeStatus] || row.employeeStatus" :tone="statusTone(row.employeeStatus)" />
              </div>
            </template>
            <template #cell-hireDate="{ row }">{{ formatDate(row.hireDate) }}</template>
            <template #cell-actions="{ row }">
              <div class="flex justify-end gap-2">
                <Button size="sm" :variant="selectedEmployeeId === row.id ? 'primary' : 'outline'" @click="selectedEmployeeId = row.id">详情</Button>
                <Button size="icon" variant="ghost" title="编辑员工" @click="openEditEmployee(row.id)">
                  <Edit3 class="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="删除员工" @click="pendingDelete = { kind: 'employee', id: row.id, label: row.name }">
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            </template>
          </DataTable>
        </div>

        <aside class="min-w-0 bg-slate-50/60 dark:bg-slate-950/30">
          <div v-if="!selectedEmployee" class="flex h-full min-h-[480px] items-center justify-center p-6 text-center text-sm text-slate-500">
            请选择员工查看档案资料
          </div>
          <div v-else class="flex h-full min-h-0 flex-col">
            <div class="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/80">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{{ buildEmployeeLabel(selectedEmployee) }}</h2>
                    <StatusBadge :label="employeeStatusLabel[selectedEmployee.employeeStatus] || selectedEmployee.employeeStatus" :tone="statusTone(selectedEmployee.employeeStatus)" />
                  </div>
                  <div class="mt-2 text-xs text-slate-500">{{ selectedEmployee.deptName || '未分配部门' }} · {{ selectedEmployee.postName || '未配置岗位' }} · 入职 {{ formatDate(selectedEmployee.hireDate) }}</div>
                </div>
                <Button size="icon" variant="outline" @click="openEditEmployee(selectedEmployee.id)">
                  <Edit3 class="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div class="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/80">
              <div class="flex gap-2 overflow-x-auto">
                <Button :variant="activeTab === 'contracts' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'contracts'">合同</Button>
                <Button :variant="activeTab === 'documents' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'documents'">证件</Button>
                <Button :variant="activeTab === 'contacts' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'contacts'">联系人</Button>
                <Button :variant="activeTab === 'salary' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'salary'">薪酬</Button>
                <Button :variant="activeTab === 'insurance' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'insurance'">社保</Button>
                <Button :variant="activeTab === 'tax' ? 'primary' : 'outline'" size="sm" @click="activeTab = 'tax'">个税</Button>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-auto p-4">
              <Panel v-if="activeTab === 'contracts'" title="员工合同">
                <template #icon><FileText class="h-4 w-4 text-slate-500" /></template>
                <template #actions><Button size="sm" @click="openContractDialog()"><Plus class="h-3.5 w-3.5" />新增</Button></template>
                <DataTable :columns="contractColumns" :data="contracts" :loading="detailLoading" row-key="id">
                  <template #cell-contractType="{ row }">{{ contractTypeLabel[row.contractType] || row.contractType }}</template>
                  <template #cell-startDate="{ row }">{{ formatDate(row.startDate) }} ~ {{ formatDate(row.endDate) }}</template>
                  <template #cell-status="{ row }"><StatusBadge :label="contractStatusLabel[row.status || ''] || row.status || '-'" :tone="statusTone(row.status)" /></template>
                  <template #cell-actions="{ row }">
                    <div class="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" @click="openContractDialog(row)"><Edit3 class="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" @click="pendingDelete = { kind: 'contract', id: row.id, label: row.contractNo }"><Trash2 class="h-4 w-4" /></Button>
                    </div>
                  </template>
                </DataTable>
              </Panel>

              <Panel v-else-if="activeTab === 'documents'" title="员工证件">
                <template #icon><IdCard class="h-4 w-4 text-slate-500" /></template>
                <template #actions><Button size="sm" @click="openDocumentDialog()"><Plus class="h-3.5 w-3.5" />新增</Button></template>
                <DataTable :columns="documentColumns" :data="documents" :loading="detailLoading" row-key="id">
                  <template #cell-documentType="{ row }">{{ documentTypeLabel[row.documentType] || row.documentType }}</template>
                  <template #cell-expiryDate="{ row }">{{ formatDate(row.expiryDate, '长期有效') }}</template>
                  <template #cell-actions="{ row }">
                    <div class="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" @click="openDocumentDialog(row)"><Edit3 class="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" @click="pendingDelete = { kind: 'document', id: row.id, label: row.documentNo }"><Trash2 class="h-4 w-4" /></Button>
                    </div>
                  </template>
                </DataTable>
              </Panel>

              <Panel v-else-if="activeTab === 'contacts'" title="紧急联系人">
                <template #icon><Phone class="h-4 w-4 text-slate-500" /></template>
                <template #actions><Button size="sm" @click="openContactDialog()"><Plus class="h-3.5 w-3.5" />新增</Button></template>
                <DataTable :columns="contactColumns" :data="contacts" :loading="detailLoading" row-key="id">
                  <template #cell-relationship="{ row }">{{ row.relationshipName || relationshipLabel[row.relationship] || row.relationship }}</template>
                  <template #cell-priority="{ row }">P{{ row.priority || 1 }}</template>
                  <template #cell-actions="{ row }">
                    <div class="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" @click="openContactDialog(row)"><Edit3 class="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" @click="pendingDelete = { kind: 'contact', id: row.id, label: row.contactName }"><Trash2 class="h-4 w-4" /></Button>
                    </div>
                  </template>
                </DataTable>
              </Panel>

              <Panel v-else-if="activeTab === 'salary'" title="薪酬摘要">
                <template #icon><BadgeDollarSign class="h-4 w-4 text-slate-500" /></template>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
                    <div class="text-xs text-slate-500">当前薪资</div>
                    <div class="mt-2 text-xl font-semibold">{{ formatCurrency(salaryDetail?.totalSalary) }}</div>
                    <div class="mt-1 text-xs text-slate-500">{{ salaryDetail?.structureName || '未分配薪资结构' }}</div>
                  </div>
                  <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
                    <div class="text-xs text-slate-500">生效日期</div>
                    <div class="mt-2 text-xl font-semibold">{{ formatDate(salaryDetail?.effectiveDate) }}</div>
                    <div class="mt-1 text-xs text-slate-500">{{ salaryDetail?.statusDesc || salaryDetail?.status || '-' }}</div>
                  </div>
                </div>
                <div class="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  <table class="table">
                    <tbody>
                      <tr v-for="item in salaryDetail?.items || []" :key="String(item.itemId)">
                        <td>{{ item.itemName || item.itemCode || item.itemId }}</td>
                        <td class="text-right">{{ formatCurrency(item.amount) }}</td>
                      </tr>
                      <tr v-if="!salaryDetail?.items?.length"><td colspan="2" class="text-center text-slate-500">暂无薪资明细</td></tr>
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel v-else-if="activeTab === 'insurance'" title="社保摘要">
                <template #icon><ShieldCheck class="h-4 w-4 text-slate-500" /></template>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
                    <div class="text-xs text-slate-500">社保方案</div>
                    <div class="mt-2 text-base font-semibold">{{ insuranceDetail?.schemeName || '未分配' }}</div>
                    <div class="mt-1 text-xs text-slate-500">{{ insuranceDetail?.city || '-' }}</div>
                  </div>
                  <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
                    <div class="text-xs text-slate-500">缴纳基数</div>
                    <div class="mt-2 text-base font-semibold">{{ formatCurrency(insuranceDetail?.base) }}</div>
                    <div class="mt-1 text-xs text-slate-500">个人 {{ formatCurrency(insuranceDetail?.personalTotal) }} · 公司 {{ formatCurrency(insuranceDetail?.companyTotal) }}</div>
                  </div>
                </div>
              </Panel>

              <Panel v-else title="个税专项扣除">
                <template #icon><Landmark class="h-4 w-4 text-slate-500" /></template>
                <DataTable :columns="taxColumns" :data="taxDeductions" :loading="detailLoading" row-key="id">
                  <template #cell-amount="{ row }">{{ formatCurrency(row.amount) }}</template>
                  <template #cell-startDate="{ row }">{{ formatDate(row.startDate) }} ~ {{ formatDate(row.endDate, '长期有效') }}</template>
                  <template #cell-status="{ row }"><StatusBadge :label="row.status || 'ACTIVE'" :tone="statusTone(row.status || 'ACTIVE')" /></template>
                </DataTable>
              </Panel>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <BaseDialog :show="Boolean(dialogMode)" :title="dialogMode === 'employee' ? (editingId ? '编辑员工档案' : '新建员工档案') : dialogMode === 'contract' ? (editingId ? '编辑员工合同' : '新增员工合同') : dialogMode === 'document' ? (editingId ? '编辑员工证件' : '新增员工证件') : (editingId ? '编辑紧急联系人' : '新增紧急联系人')" width="extra-wide" @close="dialogMode = null">
      <div v-if="dialogMode === 'employee'" class="space-y-4">
        <Panel title="基础信息">
          <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Input v-model="employeeForm.employeeNo" label="工号" :disabled="Boolean(editingId)" required />
            <Input v-model="employeeForm.name" label="姓名" required />
            <label class="space-y-2"><span class="text-sm font-medium">性别</span><Select v-model="employeeForm.gender" :options="genderOptions" /></label>
            <label class="space-y-2"><span class="text-sm font-medium">员工类型</span><Select v-model="employeeForm.employeeType" :options="employeeTypeOptions" /></label>
            <label class="space-y-2"><span class="text-sm font-medium">员工状态</span><Select v-model="employeeForm.employeeStatus" :options="formStatusOptions" /></label>
            <Input v-model="employeeForm.birthDate" label="出生日期" type="date" />
            <Input v-model="employeeForm.phone" label="手机号" />
            <Input v-model="employeeForm.email" label="邮箱" />
            <Input v-model="employeeForm.userId" label="关联用户ID" type="number" />
          </div>
        </Panel>
        <Panel title="组织与时间">
          <template #icon><ContactRound class="h-4 w-4 text-slate-500" /></template>
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label class="space-y-2"><span class="text-sm font-medium">部门</span><Select v-model="employeeForm.deptId" :options="deptSelectOptions" searchable /></label>
            <label class="space-y-2"><span class="text-sm font-medium">岗位</span><Select v-model="employeeForm.postId" :options="postSelectOptions" searchable /></label>
            <label class="space-y-2"><span class="text-sm font-medium">职位</span><Select v-model="employeeForm.positionId" :options="positionSelectOptions" searchable /></label>
            <Input v-model="employeeForm.hireDate" label="入职日期" type="date" />
            <Input v-model="employeeForm.regularDate" label="转正日期" type="date" />
            <Input v-model="employeeForm.resignDate" label="离职日期" type="date" />
          </div>
        </Panel>
      </div>

      <div v-else-if="dialogMode === 'contract'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">合同类型</span><Select v-model="contractForm.contractType" :options="contractTypeOptions" /></label>
        <Input v-model="contractForm.contractNo" label="合同编号" required />
        <label class="space-y-2"><span class="text-sm font-medium">合同状态</span><Select v-model="contractForm.status" :options="contractStatusOptions" /></label>
        <Input v-model="contractForm.duration" label="合同期限(月)" type="number" />
        <Input v-model="contractForm.signDate" label="签订日期" type="date" />
        <Input v-model="contractForm.startDate" label="开始日期" type="date" />
        <Input v-model="contractForm.endDate" label="结束日期" type="date" />
        <TextArea v-model="contractForm.attachmentValue" label="附件 URL（一行一个）" class="md:col-span-2" />
      </div>

      <div v-else-if="dialogMode === 'document'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">证件类型</span><Select v-model="documentForm.documentType" :options="documentTypeOptions" /></label>
        <Input v-model="documentForm.documentNo" label="证件号码" required />
        <Input v-model="documentForm.issueDate" label="签发日期" type="date" />
        <Input v-model="documentForm.expiryDate" label="有效期至" type="date" />
        <TextArea v-model="documentForm.attachmentValue" label="扫描件 URL（一行一个）" class="md:col-span-2" />
      </div>

      <div v-else-if="dialogMode === 'contact'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="contactForm.contactName" label="联系人姓名" required />
        <label class="space-y-2"><span class="text-sm font-medium">关系</span><Select v-model="contactForm.relationship" :options="relationshipOptions" /></label>
        <Input v-model="contactForm.phone" label="联系电话" required />
        <Input v-model="contactForm.priority" label="优先级" type="number" />
        <Input v-model="contactForm.address" label="联系地址" class="md:col-span-2" />
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="dialogMode = null">取消</Button>
          <Button :disabled="submitting" @click="handleDialogSave">
            <Save class="h-4 w-4" />
            {{ submitting ? '保存中...' : '保存' }}
          </Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(pendingDelete)"
      title="确认删除"
      :message="pendingDelete ? `确认删除 ${pendingDelete.label} 吗？删除后不可恢复。` : ''"
      danger
      :confirm-text="submitting ? '删除中...' : '确认删除'"
      @cancel="pendingDelete = null"
      @confirm="handleConfirmDelete"
    />
  </div>
</template>
