<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BadgeDollarSign,
  Calculator,
  Edit3,
  Landmark,
  Layers3,
  ListChecks,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trash2,
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
  type EmployeeInsurance,
  type EmployeeSalary,
  type EmployeeTaxDeduction,
  type HrEmployee,
  type InsuranceCalculation,
  type InsuranceScheme,
  type JobLevelOption,
  type SalaryAdjustment,
  type SalaryGrade,
  type SalaryItem,
  type SalaryStructure,
  type TaxCalculation,
  type TaxConfig,
  addTaxDeduction,
  approveSalaryAdjustment,
  assignInsuranceScheme,
  assignSalaryStructure,
  calculateEmployeeInsurance,
  calculateTax,
  createInsuranceScheme,
  createSalaryAdjustment,
  createSalaryItem,
  createSalaryStructure,
  createTaxConfig,
  deleteSalaryGrade,
  deleteSalaryItem,
  deleteSalaryStructure,
  deleteTaxDeduction,
  effectiveSalaryAdjustment,
  getCurrentTaxConfig,
  getSalaryStructure,
  listEmployeeInsurances,
  listEmployeeSalaries,
  listEmployees,
  listInsuranceSchemes,
  listJobLevels,
  listSalaryAdjustments,
  listSalaryGrades,
  listSalaryItems,
  listSalaryStructures,
  listTaxDeductions,
  setSalaryGrade,
  submitSalaryAdjustment,
  updateInsuranceScheme,
  updateSalaryItem,
  updateSalaryStructure,
  updateTaxConfig,
  type HrRecord
} from '@/services/api/hr'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import {
  adjustmentTypeLabel,
  buildEmployeeLabel,
  deductionTypeLabel,
  formatCurrency,
  formatDate,
  normalizeRows,
  salaryCategoryLabel,
  salaryItemTypeLabel,
  statusTone,
  todayValue
} from './hrUtils'

type Section = 'employees' | 'adjustments' | 'items' | 'structures' | 'grades' | 'insurance' | 'tax'
type DialogMode = 'item' | 'structure' | 'grade' | 'assignSalary' | 'adjustment' | 'insuranceScheme' | 'assignInsurance' | 'taxConfig' | 'taxDeduction' | null
type DeleteTarget =
  | { kind: 'item'; id: number; label: string }
  | { kind: 'structure'; id: number; label: string }
  | { kind: 'grade'; id: number; label: string }
  | { kind: 'deduction'; id: number; label: string; employeeId: number }

const toast = useToastStore()
const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const section = ref<Section>('employees')
const dialogMode = ref<DialogMode>(null)
const editingId = ref<number | null>(null)
const pendingDelete = ref<DeleteTarget | null>(null)
const keyword = ref('')
const employees = ref<HrEmployee[]>([])
const salaryItems = ref<SalaryItem[]>([])
const salaryStructures = ref<SalaryStructure[]>([])
const salaryGrades = ref<SalaryGrade[]>([])
const jobLevels = ref<JobLevelOption[]>([])
const employeeSalaries = ref<EmployeeSalary[]>([])
const salaryAdjustments = ref<SalaryAdjustment[]>([])
const insuranceSchemes = ref<InsuranceScheme[]>([])
const employeeInsurances = ref<EmployeeInsurance[]>([])
const taxConfig = ref<TaxConfig | null>(null)
const selectedEmployeeId = ref<number | null>(null)
const taxDeductions = ref<EmployeeTaxDeduction[]>([])
const insuranceCalculation = ref<InsuranceCalculation | null>(null)
const taxCalculation = ref<TaxCalculation | null>(null)

const itemForm = ref({
  itemCode: '',
  itemName: '',
  itemType: 'FIXED',
  category: 'BASIC',
  formula: '',
  isTaxable: true,
  sortOrder: '1',
  status: 1
})

const structureForm = ref({
  structureCode: '',
  structureName: '',
  description: '',
  itemIds: [] as number[],
  status: 1
})

const gradeForm = ref({
  levelId: '',
  minSalary: '0',
  midSalary: '0',
  maxSalary: '0',
  currency: 'CNY'
})

const assignSalaryForm = ref({
  employeeId: '',
  structureId: '',
  effectiveDate: todayValue(),
  salaryData: {} as Record<string, string>
})

const adjustmentForm = ref({
  employeeId: '',
  adjustmentType: 'ANNUAL',
  adjustmentReason: '',
  afterTotal: '0',
  effectiveDate: todayValue(),
  afterSalaryData: '{}'
})

const insuranceSchemeForm = ref({
  schemeName: '',
  city: '上海',
  pensionCompanyRate: '16',
  pensionPersonalRate: '8',
  medicalCompanyRate: '9.5',
  medicalPersonalRate: '2',
  unemploymentCompanyRate: '0.5',
  unemploymentPersonalRate: '0.5',
  injuryCompanyRate: '0.2',
  maternityCompanyRate: '1',
  housingFundCompanyRate: '7',
  housingFundPersonalRate: '7',
  baseMin: '0',
  baseMax: '0',
  baseRule: '',
  effectiveDate: todayValue()
})

const assignInsuranceForm = ref({
  employeeId: '',
  schemeId: '',
  base: '0',
  effectiveDate: todayValue()
})

const taxConfigForm = ref({
  threshold: '5000',
  effectiveDate: todayValue(),
  taxBrackets: '',
  deductionItems: '',
  status: 1
})

const taxDeductionForm = ref({
  employeeId: '',
  deductionType: 'CHILD_EDU',
  amount: '1000',
  startDate: todayValue(),
  endDate: '',
  remark: ''
})

const sectionItems: Array<{ value: Section; label: string }> = [
  { value: 'employees', label: '员工薪资' },
  { value: 'adjustments', label: '调薪申请' },
  { value: 'items', label: '薪资项目' },
  { value: 'structures', label: '薪资结构' },
  { value: 'grades', label: '薪资等级' },
  { value: 'insurance', label: '社保个税' },
  { value: 'tax', label: '专项扣除' }
]

const sectionPathMap: Record<Section, string> = {
  employees: '/hr/salary',
  adjustments: '/hr/salary/adjustments',
  items: '/hr/salary/items',
  structures: '/hr/salary/structures',
  grades: '/hr/salary/grades',
  insurance: '/hr/salary/insurance',
  tax: '/hr/salary/tax'
}

const resolveSectionFromPath = (path: string): Section => {
  if (path.startsWith('/hr/salary/adjustments')) return 'adjustments'
  if (path.startsWith('/hr/salary/items')) return 'items'
  if (path.startsWith('/hr/salary/structures')) return 'structures'
  if (path.startsWith('/hr/salary/grades')) return 'grades'
  if (path.startsWith('/hr/salary/insurance')) return 'insurance'
  if (path.startsWith('/hr/salary/tax')) return 'tax'
  return 'employees'
}

const switchSection = (value: Section) => {
  section.value = value
  const targetPath = sectionPathMap[value]
  if (route.path !== targetPath) void router.push(targetPath)
}

const statusOptions: SelectOption[] = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
]

const itemTypeOptions: SelectOption[] = [
  { value: 'FIXED', label: '固定项' },
  { value: 'VARIABLE', label: '浮动项' }
]

const categoryOptions: SelectOption[] = [
  { value: 'BASIC', label: '基本工资' },
  { value: 'ALLOWANCE', label: '津贴' },
  { value: 'BONUS', label: '奖金' },
  { value: 'DEDUCTION', label: '扣款' },
  { value: 'INSURANCE', label: '社保' },
  { value: 'TAX', label: '个税' }
]

const boolOptions: SelectOption[] = [
  { value: true, label: '是' },
  { value: false, label: '否' }
]

const adjustmentTypeOptions: SelectOption[] = Object.entries(adjustmentTypeLabel).map(([value, label]) => ({ value, label }))
const deductionTypeOptions: SelectOption[] = Object.entries(deductionTypeLabel).map(([value, label]) => ({ value, label }))

const employeeOptions = computed<SelectOption[]>(() =>
  employees.value.map((item) => ({ value: item.id, label: buildEmployeeLabel(item) }))
)

const structureOptions = computed<SelectOption[]>(() =>
  salaryStructures.value.map((item) => ({ value: item.id, label: item.structureName }))
)

const itemOptions = computed<SelectOption[]>(() =>
  salaryItems.value.map((item) => ({ value: item.id, label: `${item.itemName} (${salaryCategoryLabel[item.category] || item.category})` }))
)

const levelOptions = computed<SelectOption[]>(() =>
  jobLevels.value.map((item) => ({ value: item.id, label: `${item.levelCode || item.id} ${item.levelName}` }))
)

const insuranceSchemeOptions = computed<SelectOption[]>(() =>
  insuranceSchemes.value.map((item) => ({ value: item.id, label: `${item.schemeName} · ${item.city}` }))
)

const currentStructureDetail = computed(() => {
  const id = Number(assignSalaryForm.value.structureId)
  return salaryStructures.value.find((item) => item.id === id)
})

const visibleEmployeeSalaries = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return employeeSalaries.value.filter((item) =>
    !query || [item.employeeName, item.employeeNo, item.deptName, item.structureName].filter(Boolean).join(' ').toLowerCase().includes(query)
  )
})

const itemColumns: Column<SalaryItem>[] = [
  { key: 'itemCode', label: '编码' },
  { key: 'itemName', label: '项目' },
  { key: 'itemType', label: '类型' },
  { key: 'category', label: '分类' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const structureColumns: Column<SalaryStructure>[] = [
  { key: 'structureCode', label: '编码' },
  { key: 'structureName', label: '结构' },
  { key: 'description', label: '说明' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const gradeColumns: Column<SalaryGrade>[] = [
  { key: 'levelName', label: '职级' },
  { key: 'minSalary', label: '最低' },
  { key: 'midSalary', label: '中位' },
  { key: 'maxSalary', label: '最高' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const employeeSalaryColumns: Column<EmployeeSalary>[] = [
  { key: 'employeeName', label: '员工' },
  { key: 'structureName', label: '薪资结构' },
  { key: 'totalSalary', label: '当前薪资' },
  { key: 'effectiveDate', label: '生效日期' },
  { key: 'status', label: '状态' }
]

const adjustmentColumns: Column<SalaryAdjustment>[] = [
  { key: 'applicationNo', label: '申请单' },
  { key: 'employeeName', label: '员工' },
  { key: 'adjustmentType', label: '类型' },
  { key: 'afterTotal', label: '调薪后' },
  { key: 'effectiveDate', label: '生效日期' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const insuranceColumns: Column<InsuranceScheme>[] = [
  { key: 'schemeName', label: '方案' },
  { key: 'city', label: '城市' },
  { key: 'baseMin', label: '基数范围' },
  { key: 'effectiveDate', label: '生效日期' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const employeeInsuranceColumns: Column<EmployeeInsurance>[] = [
  { key: 'employeeName', label: '员工' },
  { key: 'schemeName', label: '方案' },
  { key: 'base', label: '基数' },
  { key: 'effectiveDate', label: '生效日期' },
  { key: 'status', label: '状态' }
]

const taxDeductionColumns: Column<EmployeeTaxDeduction>[] = [
  { key: 'deductionType', label: '类型' },
  { key: 'amount', label: '金额' },
  { key: 'startDate', label: '周期' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const loadAll = async () => {
  loading.value = true
  try {
    const [employeeRes, itemRes, structureRes, gradeRes, levelRes, salaryRes, adjustmentRes, schemeRes, insuranceRes, taxConfigRes] = await Promise.allSettled([
      listEmployees(),
      listSalaryItems(),
      listSalaryStructures(),
      listSalaryGrades(),
      listJobLevels(),
      listEmployeeSalaries(),
      listSalaryAdjustments({ pageNum: 1, pageSize: 50 }),
      listInsuranceSchemes(),
      listEmployeeInsurances({ pageNum: 1, pageSize: 50 }),
      getCurrentTaxConfig()
    ])
    employees.value = employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []
    salaryItems.value = itemRes.status === 'fulfilled' ? normalizeRows<SalaryItem>(itemRes.value) : []
    salaryStructures.value = structureRes.status === 'fulfilled' ? normalizeRows<SalaryStructure>(structureRes.value) : []
    salaryGrades.value = gradeRes.status === 'fulfilled' ? normalizeRows<SalaryGrade>(gradeRes.value) : []
    jobLevels.value = levelRes.status === 'fulfilled' ? normalizeRows<JobLevelOption>(levelRes.value) : []
    employeeSalaries.value = salaryRes.status === 'fulfilled' ? normalizeRows<EmployeeSalary>(salaryRes.value) : []
    salaryAdjustments.value = adjustmentRes.status === 'fulfilled' ? normalizeRows<SalaryAdjustment>(adjustmentRes.value) : []
    insuranceSchemes.value = schemeRes.status === 'fulfilled' ? normalizeRows<InsuranceScheme>(schemeRes.value) : []
    employeeInsurances.value = insuranceRes.status === 'fulfilled' ? normalizeRows<EmployeeInsurance>(insuranceRes.value) : []
    taxConfig.value = taxConfigRes.status === 'fulfilled' ? taxConfigRes.value : null
    if (!selectedEmployeeId.value && employees.value[0]) selectedEmployeeId.value = employees.value[0].id
    if (selectedEmployeeId.value) await loadTaxDeductions(selectedEmployeeId.value)
  } catch (error) {
    toast.error(getErrorMessage(error, '薪酬数据加载失败'))
  } finally {
    loading.value = false
  }
}

const loadTaxDeductions = async (employeeId: number) => {
  try {
    taxDeductions.value = await listTaxDeductions(employeeId)
  } catch {
    taxDeductions.value = []
  }
}

const openItemDialog = (item?: SalaryItem) => {
  editingId.value = item?.id || null
  itemForm.value = {
    itemCode: item?.itemCode || '',
    itemName: item?.itemName || '',
    itemType: item?.itemType || 'FIXED',
    category: item?.category || 'BASIC',
    formula: item?.formula || item?.calculationRule || '',
    isTaxable: item?.isTaxable ?? true,
    sortOrder: item?.sortOrder == null ? '1' : String(item.sortOrder),
    status: item?.status ?? 1
  }
  dialogMode.value = 'item'
}

const openStructureDialog = async (item?: SalaryStructure) => {
  editingId.value = item?.id || null
  let detail = item as SalaryStructure | undefined
  if (item?.id) {
    try {
      detail = await getSalaryStructure(item.id)
    } catch {
      detail = item
    }
  }
  structureForm.value = {
    structureCode: detail?.structureCode || '',
    structureName: detail?.structureName || '',
    description: detail?.description || '',
    itemIds: detail?.itemIds || (detail as { items?: SalaryItem[] } | undefined)?.items?.map((entry) => entry.id) || [],
    status: detail?.status ?? 1
  }
  dialogMode.value = 'structure'
}

const openGradeDialog = (item?: SalaryGrade) => {
  editingId.value = item?.id || null
  gradeForm.value = {
    levelId: item?.levelId ? String(item.levelId) : '',
    minSalary: String(item?.minSalary ?? 0),
    midSalary: String(item?.midSalary ?? item?.medianSalary ?? 0),
    maxSalary: String(item?.maxSalary ?? 0),
    currency: item?.currency || 'CNY'
  }
  dialogMode.value = 'grade'
}

const openAssignSalaryDialog = (item?: EmployeeSalary) => {
  const employeeId = item?.employeeId || selectedEmployeeId.value || employees.value[0]?.id
  const structureId = item?.structureId || salaryStructures.value[0]?.id
  assignSalaryForm.value = {
    employeeId: employeeId ? String(employeeId) : '',
    structureId: structureId ? String(structureId) : '',
    effectiveDate: todayValue(),
    salaryData: {}
  }
  salaryItems.value.forEach((salaryItem) => {
    assignSalaryForm.value.salaryData[String(salaryItem.id)] = ''
  })
  dialogMode.value = 'assignSalary'
}

const openAdjustmentDialog = (item?: EmployeeSalary) => {
  adjustmentForm.value = {
    employeeId: item?.employeeId ? String(item.employeeId) : selectedEmployeeId.value ? String(selectedEmployeeId.value) : '',
    adjustmentType: 'ANNUAL',
    adjustmentReason: '',
    afterTotal: String(item?.totalSalary || 0),
    effectiveDate: todayValue(),
    afterSalaryData: '{}'
  }
  dialogMode.value = 'adjustment'
}

const openInsuranceSchemeDialog = (item?: InsuranceScheme) => {
  editingId.value = item?.id || null
  insuranceSchemeForm.value = {
    schemeName: item?.schemeName || '',
    city: item?.city || '上海',
    pensionCompanyRate: String(item?.pensionCompanyRate ?? 16),
    pensionPersonalRate: String(item?.pensionPersonalRate ?? 8),
    medicalCompanyRate: String(item?.medicalCompanyRate ?? 9.5),
    medicalPersonalRate: String(item?.medicalPersonalRate ?? 2),
    unemploymentCompanyRate: String(item?.unemploymentCompanyRate ?? 0.5),
    unemploymentPersonalRate: String(item?.unemploymentPersonalRate ?? 0.5),
    injuryCompanyRate: String(item?.injuryCompanyRate ?? 0.2),
    maternityCompanyRate: String(item?.maternityCompanyRate ?? 1),
    housingFundCompanyRate: String(item?.housingFundCompanyRate ?? 7),
    housingFundPersonalRate: String(item?.housingFundPersonalRate ?? 7),
    baseMin: String(item?.baseMin ?? 0),
    baseMax: String(item?.baseMax ?? 0),
    baseRule: item?.baseRule || '',
    effectiveDate: formatDate(item?.effectiveDate, todayValue())
  }
  dialogMode.value = 'insuranceScheme'
}

const openAssignInsuranceDialog = (item?: EmployeeInsurance) => {
  assignInsuranceForm.value = {
    employeeId: item?.employeeId ? String(item.employeeId) : selectedEmployeeId.value ? String(selectedEmployeeId.value) : '',
    schemeId: item?.schemeId ? String(item.schemeId) : insuranceSchemes.value[0]?.id ? String(insuranceSchemes.value[0].id) : '',
    base: String(item?.base ?? 0),
    effectiveDate: todayValue()
  }
  insuranceCalculation.value = null
  dialogMode.value = 'assignInsurance'
}

const openTaxConfigDialog = () => {
  editingId.value = taxConfig.value?.id || null
  taxConfigForm.value = {
    threshold: String(taxConfig.value?.threshold ?? 5000),
    effectiveDate: formatDate(taxConfig.value?.effectiveDate, todayValue()),
    taxBrackets: taxConfig.value?.taxBrackets || '',
    deductionItems: taxConfig.value?.deductionItems || '',
    status: taxConfig.value?.status ?? 1
  }
  dialogMode.value = 'taxConfig'
}

const openTaxDeductionDialog = (item?: EmployeeTaxDeduction) => {
  editingId.value = item?.id || null
  taxDeductionForm.value = {
    employeeId: item?.employeeId ? String(item.employeeId) : selectedEmployeeId.value ? String(selectedEmployeeId.value) : '',
    deductionType: item?.deductionType || 'CHILD_EDU',
    amount: String(item?.amount ?? 1000),
    startDate: formatDate(item?.startDate, todayValue()),
    endDate: item?.endDate ? formatDate(item.endDate) : '',
    remark: item?.remark || ''
  }
  dialogMode.value = 'taxDeduction'
}

const selectedEmployee = computed(() => employees.value.find((item) => item.id === selectedEmployeeId.value) || null)

const saveItem = async () => {
  if (!itemForm.value.itemCode.trim() || !itemForm.value.itemName.trim()) {
    toast.error('请填写项目编码和名称')
    return
  }
  const payload = {
    itemCode: itemForm.value.itemCode.trim(),
    itemName: itemForm.value.itemName.trim(),
    itemType: itemForm.value.itemType,
    category: itemForm.value.category,
    formula: itemForm.value.formula,
    isTaxable: itemForm.value.isTaxable,
    sortOrder: Number(itemForm.value.sortOrder || 0),
    status: Number(itemForm.value.status)
  }
  if (editingId.value) await updateSalaryItem(editingId.value, payload)
  else await createSalaryItem(payload)
}

const saveStructure = async () => {
  if (!structureForm.value.structureCode.trim() || !structureForm.value.structureName.trim()) {
    toast.error('请填写结构编码和名称')
    return
  }
  const payload = {
    structureCode: structureForm.value.structureCode.trim(),
    structureName: structureForm.value.structureName.trim(),
    description: structureForm.value.description,
    itemIds: structureForm.value.itemIds,
    status: Number(structureForm.value.status)
  }
  if (editingId.value) await updateSalaryStructure(editingId.value, payload)
  else await createSalaryStructure(payload)
}

const saveGrade = async () => {
  if (!gradeForm.value.levelId) {
    toast.error('请选择职级')
    return
  }
  await setSalaryGrade({
    levelId: Number(gradeForm.value.levelId),
    minSalary: Number(gradeForm.value.minSalary || 0),
    midSalary: Number(gradeForm.value.midSalary || 0),
    maxSalary: Number(gradeForm.value.maxSalary || 0),
    currency: gradeForm.value.currency
  })
}

const saveAssignSalary = async () => {
  if (!assignSalaryForm.value.employeeId || !assignSalaryForm.value.structureId) {
    toast.error('请选择员工和薪资结构')
    return
  }
  const salaryData = Object.fromEntries(
    Object.entries(assignSalaryForm.value.salaryData).map(([key, value]) => [key, Number(value || 0)])
  )
  await assignSalaryStructure({
    employeeId: Number(assignSalaryForm.value.employeeId),
    structureId: Number(assignSalaryForm.value.structureId),
    effectiveDate: assignSalaryForm.value.effectiveDate,
    salaryData
  })
}

const saveAdjustment = async () => {
  if (!adjustmentForm.value.employeeId || !adjustmentForm.value.effectiveDate) {
    toast.error('请选择员工和生效日期')
    return
  }
  try {
    JSON.parse(adjustmentForm.value.afterSalaryData || '{}')
  } catch {
    toast.error('调薪后薪资 JSON 格式不正确')
    return
  }
  await createSalaryAdjustment({
    employeeId: Number(adjustmentForm.value.employeeId),
    adjustmentType: adjustmentForm.value.adjustmentType,
    adjustmentReason: adjustmentForm.value.adjustmentReason,
    afterTotal: Number(adjustmentForm.value.afterTotal || 0),
    effectiveDate: adjustmentForm.value.effectiveDate,
    afterSalaryData: adjustmentForm.value.afterSalaryData || '{}'
  })
}

const saveInsuranceScheme = async () => {
  const payload = {
    schemeName: insuranceSchemeForm.value.schemeName.trim(),
    city: insuranceSchemeForm.value.city.trim(),
    pensionCompanyRate: Number(insuranceSchemeForm.value.pensionCompanyRate || 0),
    pensionPersonalRate: Number(insuranceSchemeForm.value.pensionPersonalRate || 0),
    medicalCompanyRate: Number(insuranceSchemeForm.value.medicalCompanyRate || 0),
    medicalPersonalRate: Number(insuranceSchemeForm.value.medicalPersonalRate || 0),
    unemploymentCompanyRate: Number(insuranceSchemeForm.value.unemploymentCompanyRate || 0),
    unemploymentPersonalRate: Number(insuranceSchemeForm.value.unemploymentPersonalRate || 0),
    injuryCompanyRate: Number(insuranceSchemeForm.value.injuryCompanyRate || 0),
    maternityCompanyRate: Number(insuranceSchemeForm.value.maternityCompanyRate || 0),
    housingFundCompanyRate: Number(insuranceSchemeForm.value.housingFundCompanyRate || 0),
    housingFundPersonalRate: Number(insuranceSchemeForm.value.housingFundPersonalRate || 0),
    baseMin: Number(insuranceSchemeForm.value.baseMin || 0),
    baseMax: Number(insuranceSchemeForm.value.baseMax || 0),
    baseRule: insuranceSchemeForm.value.baseRule,
    effectiveDate: insuranceSchemeForm.value.effectiveDate
  }
  if (!payload.schemeName || !payload.city) {
    toast.error('请填写方案名称和城市')
    return
  }
  if (editingId.value) await updateInsuranceScheme(editingId.value, payload)
  else await createInsuranceScheme(payload)
}

const saveAssignInsurance = async () => {
  if (!assignInsuranceForm.value.employeeId || !assignInsuranceForm.value.schemeId) {
    toast.error('请选择员工和社保方案')
    return
  }
  await assignInsuranceScheme({
    employeeId: Number(assignInsuranceForm.value.employeeId),
    schemeId: Number(assignInsuranceForm.value.schemeId),
    base: Number(assignInsuranceForm.value.base || 0),
    effectiveDate: assignInsuranceForm.value.effectiveDate
  })
}

const saveTaxConfig = async () => {
  const payload = {
    threshold: Number(taxConfigForm.value.threshold || 0),
    effectiveDate: taxConfigForm.value.effectiveDate,
    taxBrackets: taxConfigForm.value.taxBrackets,
    deductionItems: taxConfigForm.value.deductionItems,
    status: Number(taxConfigForm.value.status)
  }
  if (editingId.value) await updateTaxConfig(editingId.value, payload)
  else await createTaxConfig(payload)
}

const saveTaxDeduction = async () => {
  if (!taxDeductionForm.value.employeeId || !taxDeductionForm.value.startDate) {
    toast.error('请选择员工和开始日期')
    return
  }
  await addTaxDeduction({
    employeeId: Number(taxDeductionForm.value.employeeId),
    deductionType: taxDeductionForm.value.deductionType,
    amount: Number(taxDeductionForm.value.amount || 0),
    startDate: taxDeductionForm.value.startDate,
    endDate: taxDeductionForm.value.endDate || undefined,
    remark: taxDeductionForm.value.remark
  })
}

const handleDialogSave = async () => {
  submitting.value = true
  try {
    if (dialogMode.value === 'item') await saveItem()
    if (dialogMode.value === 'structure') await saveStructure()
    if (dialogMode.value === 'grade') await saveGrade()
    if (dialogMode.value === 'assignSalary') await saveAssignSalary()
    if (dialogMode.value === 'adjustment') await saveAdjustment()
    if (dialogMode.value === 'insuranceScheme') await saveInsuranceScheme()
    if (dialogMode.value === 'assignInsurance') await saveAssignInsurance()
    if (dialogMode.value === 'taxConfig') await saveTaxConfig()
    if (dialogMode.value === 'taxDeduction') await saveTaxDeduction()
    toast.success('保存成功')
    dialogMode.value = null
    await loadAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    submitting.value = false
  }
}

const handleConfirmDelete = async () => {
  if (!pendingDelete.value) return
  submitting.value = true
  try {
    if (pendingDelete.value.kind === 'item') await deleteSalaryItem(pendingDelete.value.id)
    if (pendingDelete.value.kind === 'structure') await deleteSalaryStructure(pendingDelete.value.id)
    if (pendingDelete.value.kind === 'grade') await deleteSalaryGrade(pendingDelete.value.id)
    if (pendingDelete.value.kind === 'deduction') await deleteTaxDeduction(pendingDelete.value.id)
    toast.success('已删除')
    const employeeId = pendingDelete.value.kind === 'deduction' ? pendingDelete.value.employeeId : selectedEmployeeId.value
    pendingDelete.value = null
    await loadAll()
    if (employeeId) await loadTaxDeductions(employeeId)
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    submitting.value = false
  }
}

const runSubmitAdjustment = async (id: number) => {
  try {
    await submitSalaryAdjustment(id)
    toast.success('调薪申请已提交')
    await loadAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '提交失败'))
  }
}

const runApproveAdjustment = async (id: number) => {
  try {
    await approveSalaryAdjustment(id)
    toast.success('调薪申请已审批')
    await loadAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '审批失败'))
  }
}

const runEffectiveAdjustment = async (id: number) => {
  try {
    await effectiveSalaryAdjustment(id)
    toast.success('调薪已生效')
    await loadAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '生效失败'))
  }
}

const runInsuranceCalculation = async () => {
  if (!assignInsuranceForm.value.employeeId) return
  try {
    insuranceCalculation.value = await calculateEmployeeInsurance(Number(assignInsuranceForm.value.employeeId), Number(assignInsuranceForm.value.base || 0))
  } catch (error) {
    toast.error(getErrorMessage(error, '社保测算失败'))
  }
}

const runTaxCalculation = async () => {
  const employeeId = Number(selectedEmployeeId.value || taxDeductionForm.value.employeeId)
  const salary = employeeSalaries.value.find((item) => item.employeeId === employeeId)
  if (!employeeId) {
    toast.error('请先选择员工')
    return
  }
  try {
    taxCalculation.value = await calculateTax({
      employeeId,
      taxableIncome: Number(salary?.totalSalary || 0),
      deductionAmount: taxDeductions.value.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    } as HrRecord)
  } catch (error) {
    toast.error(getErrorMessage(error, '个税测算失败'))
  }
}

onMounted(() => {
  section.value = resolveSectionFromPath(route.path)
  void loadAll()
})

watch(
  () => route.path,
  (path) => {
    section.value = resolveSectionFromPath(path)
  }
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Landmark class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Compensation Center
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">薪酬管理</h1>
      </div>
      <Button variant="outline" :disabled="loading" @click="loadAll">
        <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">已分配薪资</div><div class="mt-2 text-2xl font-semibold">{{ employeeSalaries.length }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">薪资项目</div><div class="mt-2 text-2xl font-semibold">{{ salaryItems.length }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">薪资结构</div><div class="mt-2 text-2xl font-semibold">{{ salaryStructures.length }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">调薪申请</div><div class="mt-2 text-2xl font-semibold">{{ salaryAdjustments.length }}</div></div>
    </div>

    <div class="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
      <Button v-for="item in sectionItems" :key="item.value" :variant="section === item.value ? 'primary' : 'outline'" size="sm" @click="switchSection(item.value)">{{ item.label }}</Button>
    </div>

    <Panel v-if="section === 'employees'" title="员工薪资">
      <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" @click="openAdjustmentDialog()"><Plus class="h-3.5 w-3.5" />调薪申请</Button>
          <Button size="sm" @click="openAssignSalaryDialog()"><Plus class="h-3.5 w-3.5" />分配薪资</Button>
        </div>
      </template>
      <div class="mb-4 max-w-md"><Input v-model="keyword" placeholder="搜索员工、工号、部门、薪资结构" /></div>
      <DataTable :columns="employeeSalaryColumns" :data="visibleEmployeeSalaries" :loading="loading" row-key="id">
        <template #cell-employeeName="{ row }">{{ row.employeeName || row.employeeId }}<div class="text-xs text-slate-500">{{ row.employeeNo || '-' }}</div></template>
        <template #cell-totalSalary="{ row }">{{ formatCurrency(row.totalSalary) }}</template>
        <template #cell-effectiveDate="{ row }">{{ formatDate(row.effectiveDate) }}</template>
        <template #cell-status="{ row }"><StatusBadge :label="row.statusDesc || row.status || '-'" :tone="statusTone(row.status)" /></template>
      </DataTable>
    </Panel>

    <Panel v-else-if="section === 'adjustments'" title="调薪申请">
      <template #icon><BadgeDollarSign class="h-4 w-4 text-slate-500" /></template>
      <template #actions><Button size="sm" @click="openAdjustmentDialog()"><Plus class="h-3.5 w-3.5" />新建调薪</Button></template>
      <DataTable :columns="adjustmentColumns" :data="salaryAdjustments" :loading="loading" row-key="id">
        <template #cell-adjustmentType="{ row }">{{ adjustmentTypeLabel[row.adjustmentType] || row.adjustmentType }}</template>
        <template #cell-afterTotal="{ row }">{{ formatCurrency(row.afterTotal) }}</template>
        <template #cell-effectiveDate="{ row }">{{ formatDate(row.effectiveDate) }}</template>
        <template #cell-status="{ row }"><StatusBadge :label="row.statusDesc || row.status || '-'" :tone="statusTone(row.status)" /></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="sm" variant="outline" @click="runSubmitAdjustment(row.id)">提交</Button>
            <Button size="sm" variant="outline" @click="runApproveAdjustment(row.id)">审批</Button>
            <Button size="sm" @click="runEffectiveAdjustment(row.id)">生效</Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <Panel v-else-if="section === 'items'" title="薪资项目">
      <template #icon><ListChecks class="h-4 w-4 text-slate-500" /></template>
      <template #actions><Button size="sm" @click="openItemDialog()"><Plus class="h-3.5 w-3.5" />新增项目</Button></template>
      <DataTable :columns="itemColumns" :data="salaryItems" :loading="loading" row-key="id">
        <template #cell-itemType="{ row }">{{ salaryItemTypeLabel[row.itemType] || row.itemType }}</template>
        <template #cell-category="{ row }">{{ salaryCategoryLabel[row.category] || row.category }}</template>
        <template #cell-status="{ row }"><StatusBadge :label="row.status === 1 ? '启用' : '停用'" :tone="statusTone(row.status)" /></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openItemDialog(row)"><Edit3 class="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" @click="pendingDelete = { kind: 'item', id: row.id, label: row.itemName }"><Trash2 class="h-4 w-4" /></Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <Panel v-else-if="section === 'structures'" title="薪资结构">
      <template #icon><Layers3 class="h-4 w-4 text-slate-500" /></template>
      <template #actions><Button size="sm" @click="openStructureDialog()"><Plus class="h-3.5 w-3.5" />新增结构</Button></template>
      <DataTable :columns="structureColumns" :data="salaryStructures" :loading="loading" row-key="id">
        <template #cell-status="{ row }"><StatusBadge :label="row.status === 1 ? '启用' : '停用'" :tone="statusTone(row.status)" /></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openStructureDialog(row)"><Edit3 class="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" @click="pendingDelete = { kind: 'structure', id: row.id, label: row.structureName }"><Trash2 class="h-4 w-4" /></Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <Panel v-else-if="section === 'grades'" title="薪资等级">
      <template #icon><Landmark class="h-4 w-4 text-slate-500" /></template>
      <template #actions><Button size="sm" @click="openGradeDialog()"><Plus class="h-3.5 w-3.5" />设置等级</Button></template>
      <DataTable :columns="gradeColumns" :data="salaryGrades" :loading="loading" row-key="levelId">
        <template #cell-levelName="{ row }">{{ row.levelCode || row.levelId }} · {{ row.levelName || '未命名职级' }}</template>
        <template #cell-minSalary="{ row }">{{ formatCurrency(row.minSalary) }}</template>
        <template #cell-midSalary="{ row }">{{ formatCurrency(row.midSalary || row.medianSalary) }}</template>
        <template #cell-maxSalary="{ row }">{{ formatCurrency(row.maxSalary) }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button size="icon" variant="ghost" @click="openGradeDialog(row)"><Edit3 class="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" @click="pendingDelete = { kind: 'grade', id: row.levelId, label: row.levelName || String(row.levelId) }"><Trash2 class="h-4 w-4" /></Button>
          </div>
        </template>
      </DataTable>
    </Panel>

    <div v-else-if="section === 'insurance'" class="grid gap-4 xl:grid-cols-2">
      <Panel title="社保方案">
        <template #icon><ShieldCheck class="h-4 w-4 text-slate-500" /></template>
        <template #actions><Button size="sm" @click="openInsuranceSchemeDialog()"><Plus class="h-3.5 w-3.5" />新增方案</Button></template>
        <DataTable :columns="insuranceColumns" :data="insuranceSchemes" :loading="loading" row-key="id">
          <template #cell-baseMin="{ row }">{{ formatCurrency(row.baseMin) }} - {{ formatCurrency(row.baseMax) }}</template>
          <template #cell-effectiveDate="{ row }">{{ formatDate(row.effectiveDate) }}</template>
          <template #cell-actions="{ row }"><div class="flex justify-end"><Button size="icon" variant="ghost" @click="openInsuranceSchemeDialog(row)"><Edit3 class="h-4 w-4" /></Button></div></template>
        </DataTable>
      </Panel>
      <Panel title="员工社保">
        <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
        <template #actions><Button size="sm" @click="openAssignInsuranceDialog()"><Plus class="h-3.5 w-3.5" />分配方案</Button></template>
        <DataTable :columns="employeeInsuranceColumns" :data="employeeInsurances" :loading="loading" row-key="id">
          <template #cell-base="{ row }">{{ formatCurrency(row.base) }}</template>
          <template #cell-effectiveDate="{ row }">{{ formatDate(row.effectiveDate) }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="row.statusDesc || row.status || '-'" :tone="statusTone(row.status)" /></template>
        </DataTable>
      </Panel>
    </div>

    <div v-else class="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="员工选择">
        <template #icon><Users class="h-4 w-4 text-slate-500" /></template>
        <Select v-model="selectedEmployeeId" :options="employeeOptions" searchable @change="(value) => typeof value === 'number' && loadTaxDeductions(value)" />
        <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
          <div class="font-semibold text-slate-900 dark:text-slate-100">{{ selectedEmployee ? buildEmployeeLabel(selectedEmployee) : '未选择员工' }}</div>
          <div class="mt-1 text-xs text-slate-500">当前个税配置：{{ taxConfig ? formatCurrency(taxConfig.threshold) : '未配置' }}</div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" @click="openTaxConfigDialog">维护个税配置</Button>
          <Button size="sm" @click="openTaxDeductionDialog()">新增扣除</Button>
          <Button size="sm" variant="outline" @click="runTaxCalculation">测算个税</Button>
        </div>
        <div v-if="taxCalculation" class="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100">
          个税 {{ formatCurrency(taxCalculation.taxAmount) }} · 到手 {{ formatCurrency(taxCalculation.afterTaxIncome) }}
        </div>
      </Panel>
      <Panel title="专项扣除">
        <template #icon><Calculator class="h-4 w-4 text-slate-500" /></template>
        <DataTable :columns="taxDeductionColumns" :data="taxDeductions" :loading="loading" row-key="id">
          <template #cell-deductionType="{ row }">{{ row.deductionTypeName || deductionTypeLabel[row.deductionType] || row.deductionType }}</template>
          <template #cell-amount="{ row }">{{ formatCurrency(row.amount) }}</template>
          <template #cell-startDate="{ row }">{{ formatDate(row.startDate) }} ~ {{ formatDate(row.endDate, '长期有效') }}</template>
          <template #cell-status="{ row }"><StatusBadge :label="row.status || 'ACTIVE'" :tone="statusTone(row.status || 'ACTIVE')" /></template>
          <template #cell-actions="{ row }"><div class="flex justify-end"><Button size="icon" variant="ghost" @click="pendingDelete = { kind: 'deduction', id: row.id, label: row.deductionTypeName || row.deductionType, employeeId: row.employeeId }"><Trash2 class="h-4 w-4" /></Button></div></template>
        </DataTable>
      </Panel>
    </div>

    <BaseDialog :show="Boolean(dialogMode)" title="薪酬操作" width="extra-wide" @close="dialogMode = null">
      <div v-if="dialogMode === 'item'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="itemForm.itemCode" label="项目编码" required />
        <Input v-model="itemForm.itemName" label="项目名称" required />
        <label class="space-y-2"><span class="text-sm font-medium">项目类型</span><Select v-model="itemForm.itemType" :options="itemTypeOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">分类</span><Select v-model="itemForm.category" :options="categoryOptions" /></label>
        <label class="space-y-2"><span class="text-sm font-medium">是否计税</span><Select v-model="itemForm.isTaxable" :options="boolOptions" /></label>
        <Input v-model="itemForm.sortOrder" label="排序号" type="number" />
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="itemForm.status" :options="statusOptions" /></label>
        <Input v-model="itemForm.formula" label="计算公式" />
      </div>

      <div v-else-if="dialogMode === 'structure'" class="space-y-4">
        <div class="grid gap-4 md:grid-cols-2">
          <Input v-model="structureForm.structureCode" label="结构编码" required />
          <Input v-model="structureForm.structureName" label="结构名称" required />
          <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="structureForm.status" :options="statusOptions" /></label>
          <Input v-model="structureForm.description" label="说明" />
        </div>
        <div class="grid gap-2 md:grid-cols-3">
          <label v-for="item in itemOptions" :key="String(item.value)" class="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <input v-model="structureForm.itemIds" type="checkbox" :value="Number(item.value)" class="h-4 w-4 rounded border-slate-300 text-cyan-600" />
            <span>{{ item.label }}</span>
          </label>
        </div>
      </div>

      <div v-else-if="dialogMode === 'grade'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">职级</span><Select v-model="gradeForm.levelId" :options="levelOptions" searchable /></label>
        <Input v-model="gradeForm.currency" label="币种" />
        <Input v-model="gradeForm.minSalary" label="最低薪资" type="number" />
        <Input v-model="gradeForm.midSalary" label="中位薪资" type="number" />
        <Input v-model="gradeForm.maxSalary" label="最高薪资" type="number" />
      </div>

      <div v-else-if="dialogMode === 'assignSalary'" class="space-y-4">
        <div class="grid gap-4 md:grid-cols-3">
          <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="assignSalaryForm.employeeId" :options="employeeOptions" searchable /></label>
          <label class="space-y-2"><span class="text-sm font-medium">薪资结构</span><Select v-model="assignSalaryForm.structureId" :options="structureOptions" searchable /></label>
          <Input v-model="assignSalaryForm.effectiveDate" label="生效日期" type="date" />
        </div>
        <div class="grid gap-3 md:grid-cols-3">
          <Input v-for="item in salaryItems" :key="item.id" v-model="assignSalaryForm.salaryData[String(item.id)]" :label="item.itemName" type="number" />
        </div>
        <div class="text-xs text-slate-500">当前结构：{{ currentStructureDetail?.structureName || '未选择' }}</div>
      </div>

      <div v-else-if="dialogMode === 'adjustment'" class="space-y-4">
        <div class="grid gap-4 md:grid-cols-2">
          <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="adjustmentForm.employeeId" :options="employeeOptions" searchable /></label>
          <label class="space-y-2"><span class="text-sm font-medium">调薪类型</span><Select v-model="adjustmentForm.adjustmentType" :options="adjustmentTypeOptions" /></label>
          <Input v-model="adjustmentForm.afterTotal" label="调薪后总额" type="number" />
          <Input v-model="adjustmentForm.effectiveDate" label="生效日期" type="date" />
          <TextArea v-model="adjustmentForm.adjustmentReason" label="调薪原因" />
          <TextArea v-model="adjustmentForm.afterSalaryData" label="调薪后薪资 JSON" />
        </div>
      </div>

      <div v-else-if="dialogMode === 'insuranceScheme'" class="grid gap-4 md:grid-cols-3">
        <Input v-model="insuranceSchemeForm.schemeName" label="方案名称" required />
        <Input v-model="insuranceSchemeForm.city" label="城市" required />
        <Input v-model="insuranceSchemeForm.effectiveDate" label="生效日期" type="date" />
        <Input v-model="insuranceSchemeForm.pensionCompanyRate" label="养老公司%" type="number" />
        <Input v-model="insuranceSchemeForm.pensionPersonalRate" label="养老个人%" type="number" />
        <Input v-model="insuranceSchemeForm.medicalCompanyRate" label="医疗公司%" type="number" />
        <Input v-model="insuranceSchemeForm.medicalPersonalRate" label="医疗个人%" type="number" />
        <Input v-model="insuranceSchemeForm.unemploymentCompanyRate" label="失业公司%" type="number" />
        <Input v-model="insuranceSchemeForm.unemploymentPersonalRate" label="失业个人%" type="number" />
        <Input v-model="insuranceSchemeForm.injuryCompanyRate" label="工伤公司%" type="number" />
        <Input v-model="insuranceSchemeForm.maternityCompanyRate" label="生育公司%" type="number" />
        <Input v-model="insuranceSchemeForm.housingFundCompanyRate" label="公积金公司%" type="number" />
        <Input v-model="insuranceSchemeForm.housingFundPersonalRate" label="公积金个人%" type="number" />
        <Input v-model="insuranceSchemeForm.baseMin" label="基数下限" type="number" />
        <Input v-model="insuranceSchemeForm.baseMax" label="基数上限" type="number" />
        <Input v-model="insuranceSchemeForm.baseRule" label="基数规则" />
      </div>

      <div v-else-if="dialogMode === 'assignInsurance'" class="space-y-4">
        <div class="grid gap-4 md:grid-cols-2">
          <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="assignInsuranceForm.employeeId" :options="employeeOptions" searchable /></label>
          <label class="space-y-2"><span class="text-sm font-medium">社保方案</span><Select v-model="assignInsuranceForm.schemeId" :options="insuranceSchemeOptions" searchable /></label>
          <Input v-model="assignInsuranceForm.base" label="缴纳基数" type="number" />
          <Input v-model="assignInsuranceForm.effectiveDate" label="生效日期" type="date" />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" @click="runInsuranceCalculation">测算</Button>
          <div v-if="insuranceCalculation" class="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100">
            合计 {{ formatCurrency(insuranceCalculation.totalAmount) }} · 个人 {{ formatCurrency(insuranceCalculation.personalTotal) }} · 公司 {{ formatCurrency(insuranceCalculation.companyTotal) }}
          </div>
        </div>
      </div>

      <div v-else-if="dialogMode === 'taxConfig'" class="grid gap-4 md:grid-cols-2">
        <Input v-model="taxConfigForm.threshold" label="起征点" type="number" />
        <Input v-model="taxConfigForm.effectiveDate" label="生效日期" type="date" />
        <label class="space-y-2"><span class="text-sm font-medium">状态</span><Select v-model="taxConfigForm.status" :options="statusOptions" /></label>
        <TextArea v-model="taxConfigForm.taxBrackets" label="税率表 JSON" />
        <TextArea v-model="taxConfigForm.deductionItems" label="专项扣除配置 JSON" />
      </div>

      <div v-else-if="dialogMode === 'taxDeduction'" class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2"><span class="text-sm font-medium">员工</span><Select v-model="taxDeductionForm.employeeId" :options="employeeOptions" searchable /></label>
        <label class="space-y-2"><span class="text-sm font-medium">扣除类型</span><Select v-model="taxDeductionForm.deductionType" :options="deductionTypeOptions" /></label>
        <Input v-model="taxDeductionForm.amount" label="月扣除额" type="number" />
        <Input v-model="taxDeductionForm.startDate" label="开始日期" type="date" />
        <Input v-model="taxDeductionForm.endDate" label="结束日期" type="date" />
        <Input v-model="taxDeductionForm.remark" label="备注" />
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
