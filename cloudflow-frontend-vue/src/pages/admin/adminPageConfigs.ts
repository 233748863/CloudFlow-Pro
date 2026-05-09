import {
  BadgeCheck,
  CalendarClock,
  Car,
  Handshake,
  Package,
  RotateCcw,
  ShieldAlert,
  Stamp,
  UserCheck
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { SelectOption } from '@/components/common'
import {
  addConsumableStock,
  approveVehicleUsage,
  assetRepair,
  assetReturn,
  assetScrap,
  cancelLicenseBorrow,
  cancelOaRecord,
  cancelSealApplication,
  cancelVehicleUsage,
  cancelVisitor,
  checkInDuty,
  checkInVisitor,
  checkOutDuty,
  checkOutVisitor,
  confirmLicenseBorrow,
  confirmLicenseReturn,
  confirmSealBorrow,
  confirmSealReturn,
  confirmVehicleReturn,
  confirmPaymentRequest,
  confirmVisitor,
  createPurchasePaymentRequest,
  reduceConsumableStock,
  remindLicenseBorrow,
  remindSealApplication,
  receivePurchaseRequest,
  submitOaRecord,
  submitLicenseBorrow,
  submitSealApplication,
  updateRiskStatus
} from '@/services/api/oa'

export type AdminFieldType = 'text' | 'number' | 'date' | 'datetime-local' | 'select' | 'textarea'
export type AdminTone = 'slate' | 'green' | 'red' | 'yellow' | 'cyan'

export interface AdminFieldConfig {
  key: string
  label: string
  type?: AdminFieldType
  required?: boolean
  placeholder?: string
  options?: SelectOption[]
  formOptions?: SelectOption[]
  defaultValue?: string | number | null
  table?: boolean
  filter?: boolean
  hiddenInForm?: boolean
  sortable?: boolean
  status?: boolean
  widthClass?: string
  formatter?: (value: unknown, row: AdminRecord) => string
}

export interface AdminActionConfig {
  label: string
  tone?: 'primary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning'
  visible?: (row: AdminRecord) => boolean
  run: (row: AdminRecord) => Promise<void>
  confirm?: (row: AdminRecord) => string
}

export interface AdminPageConfig {
  path: string
  title: string
  eyebrow: string
  description: string
  icon: Component
  basePath: string
  idKey: string
  primaryKey: string
  searchPlaceholder: string
  fields: AdminFieldConfig[]
  actions?: AdminActionConfig[]
  createPath?: string
  updatePath?: string
  deletePath?: string
  readOnly?: boolean
  lockWhen?: (row: AdminRecord) => boolean
  lockMessage?: string
}

export type AdminRecord = Record<string, string | number | null | undefined>

const activeOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'ACTIVE', label: '启用' },
  { value: 'DISABLED', label: '停用' }
]

const assetStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '1', label: '闲置' },
  { value: '2', label: '在用' },
  { value: '3', label: '维修' },
  { value: '4', label: '报废' },
  { value: '5', label: '丢失' }
]

const vehicleStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '1', label: '可用' },
  { value: '2', label: '已预约' },
  { value: '3', label: '使用中' },
  { value: '4', label: '维修中' },
  { value: '5', label: '报废' }
]

const usageStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '待审批' },
  { value: '1', label: '已批准' },
  { value: '2', label: '已驳回' },
  { value: '3', label: '进行中' },
  { value: '4', label: '已完成' },
  { value: '5', label: '已取消' }
]

const visitorStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待确认' },
  { value: 'CONFIRMED', label: '已确认' },
  { value: 'ARRIVED', label: '已到访' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' }
]

const dutyStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'SCHEDULED', label: '已排班' },
  { value: 'CHECKED_IN', label: '已签到' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'SWAPPED', label: '已换班' },
  { value: 'CANCELLED', label: '已取消' }
]

const borrowStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '审批中' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'BORROWED', label: '已借出' },
  { value: 'RETURNED', label: '已归还' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'CANCELLED', label: '已取消' }
]

const workflowStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '审批中' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'CANCELLED', label: '已取消' },
  { value: 'PAID', label: '已付款' }
]

const tripTransportOptions: SelectOption[] = [
  { value: 'PLANE', label: '飞机' },
  { value: 'TRAIN', label: '火车' },
  { value: 'CAR', label: '汽车' },
  { value: 'OTHER', label: '其他' }
]

const expenseCategoryOptions: SelectOption[] = [
  { value: '', label: '全部类别' },
  { value: 'TRAVEL', label: '差旅' },
  { value: 'OFFICE', label: '办公' },
  { value: 'ENTERTAIN', label: '招待' },
  { value: 'TRANSPORT', label: '交通' },
  { value: 'OTHER', label: '其他' }
]

const paymentTypeOptions: SelectOption[] = [
  { value: '', label: '全部类型' },
  { value: 'PURCHASE', label: '采购' },
  { value: 'SERVICE', label: '服务' },
  { value: 'RENT', label: '租金' },
  { value: 'OTHER', label: '其他' }
]

const contractStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '审批中' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'ACTIVE', label: '执行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' }
]

const riskLevelSelectOptions: SelectOption[] = [
  { value: '', label: '全部等级' },
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '严重' }
]

const sealTypeOptions: SelectOption[] = [
  { value: 'COMPANY', label: '公章' },
  { value: 'FINANCE', label: '财务章' },
  { value: 'CONTRACT', label: '合同章' },
  { value: 'LEGAL', label: '法人章' },
  { value: 'OTHER', label: '其他' }
]

const licenseTypeOptions: SelectOption[] = [
  { value: 'BUSINESS', label: '营业执照' },
  { value: 'PERMIT', label: '许可证' },
  { value: 'QUALIFICATION', label: '资质证书' },
  { value: 'OTHER', label: '其他' }
]

const resourceStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'AVAILABLE', label: '可用' },
  { value: 'BORROWED', label: '借出' },
  { value: 'DISABLED', label: '停用' }
]

const editableResourceStatusOptions: SelectOption[] = [
  { value: 'AVAILABLE', label: '可用' },
  { value: 'DISABLED', label: '停用' }
]

const riskStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'OPEN', label: '待处理' },
  { value: 'HANDLING', label: '处理中' },
  { value: 'CLOSED', label: '已关闭' },
  { value: 'IGNORED', label: '已忽略' }
]

const riskLevelOptions: SelectOption[] = [
  { value: '', label: '全部等级' },
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '严重' }
]

export const optionLabel = (options: SelectOption[] | undefined, value: unknown) =>
  options?.find((item) => String(item.value) === String(value))?.label || String(value ?? '-')

export const statusLabel = (value: unknown, options?: SelectOption[]) => optionLabel(options, value)

export const statusTone = (value: unknown): AdminTone => {
  const status = String(value ?? '').toUpperCase()
  if (['1', 'ACTIVE', 'AVAILABLE', 'CONFIRMED', 'ARRIVED', 'CHECKED_IN', 'APPROVED', 'BORROWED', 'RETURNED', 'COMPLETED', 'CLOSED'].includes(status)) return 'green'
  if (['0', 'PENDING', 'SCHEDULED', 'DRAFT', 'OPEN', 'HANDLING', 'MEDIUM'].includes(status)) return 'yellow'
  if (['2', '5', 'DISABLED', 'CANCELLED', 'REJECTED', 'CRITICAL', 'HIGH', 'SCRAPPED'].includes(status)) return 'red'
  if (['3', '4', 'SWAPPED'].includes(status)) return 'cyan'
  return 'slate'
}

const text = (key: string, label: string, extra: Partial<AdminFieldConfig> = {}): AdminFieldConfig => ({ key, label, type: 'text', table: true, ...extra })
const number = (key: string, label: string, extra: Partial<AdminFieldConfig> = {}): AdminFieldConfig => ({ key, label, type: 'number', table: true, ...extra })
const date = (key: string, label: string, extra: Partial<AdminFieldConfig> = {}): AdminFieldConfig => ({ key, label, type: 'date', table: true, ...extra })
const dateTime = (key: string, label: string, extra: Partial<AdminFieldConfig> = {}): AdminFieldConfig => ({ key, label, type: 'datetime-local', table: true, ...extra })
const select = (key: string, label: string, options: SelectOption[], extra: Partial<AdminFieldConfig> = {}): AdminFieldConfig => ({ key, label, type: 'select', options, table: true, status: true, ...extra })

export const adminPageConfigs: AdminPageConfig[] = [
  {
    path: '/admin/asset',
    title: '资产管理',
    eyebrow: 'Admin Asset',
    description: '维护固定资产台账、状态流转和存放位置',
    icon: Package,
    basePath: '/oa/asset',
    idKey: 'assetId',
    primaryKey: 'name',
    searchPlaceholder: '资产名称/编码',
    fields: [
      text('assetCode', '资产编码', { required: true, filter: true }),
      text('name', '资产名称', { required: true, filter: true }),
      text('category', '分类', { filter: true }),
      text('model', '型号'),
      select('status', '状态', assetStatusOptions, { defaultValue: '1', filter: true }),
      number('price', '原值'),
      date('purchaseDate', '购置日期'),
      text('location', '存放位置'),
      text('remark', '备注', { type: 'textarea', table: false })
    ],
    actions: [
      { label: '归还', tone: 'success', visible: (row) => String(row.status) === '2', run: (row) => assetReturn(row.assetId || '') },
      { label: '送修', tone: 'warning', visible: (row) => !['3', '4'].includes(String(row.status)), run: (row) => assetRepair(row.assetId || '', '前端台账操作') },
      { label: '报废', tone: 'danger', visible: (row) => String(row.status) !== '4', confirm: (row) => `确认报废资产“${row.name}”？`, run: (row) => assetScrap(row.assetId || '', '前端台账操作') }
    ]
  },
  {
    path: '/admin/vehicle/list',
    title: '车辆管理',
    eyebrow: 'Admin Vehicle',
    description: '维护车辆基础信息、保险到期和当前状态',
    icon: Car,
    basePath: '/oa/vehicle',
    idKey: 'vehicleId',
    primaryKey: 'licensePlate',
    searchPlaceholder: '车牌/品牌/型号',
    fields: [
      text('licensePlate', '车牌号', { required: true, filter: true }),
      text('brand', '品牌', { filter: true }),
      text('model', '车型'),
      text('color', '颜色'),
      number('capacity', '座位数'),
      select('status', '状态', vehicleStatusOptions, { defaultValue: '1', filter: true }),
      number('mileage', '里程'),
      date('insuranceExpiry', '保险到期'),
      text('location', '停放位置'),
      text('remark', '备注', { type: 'textarea', table: false })
    ]
  },
  {
    path: '/admin/vehicle/booking',
    title: '用车申请',
    eyebrow: 'Vehicle Booking',
    description: '提交和跟踪用车申请、审批与派车状态',
    icon: Car,
    basePath: '/oa/vehicle/usage',
    idKey: 'usageId',
    primaryKey: 'destination',
    searchPlaceholder: '目的地/申请人',
    fields: [
      number('vehicleId', '车辆ID', { required: true }),
      number('applicantId', '申请人ID'),
      text('applicantName', '申请人', { hiddenInForm: true, filter: true }),
      dateTime('startTime', '开始时间', { required: true }),
      dateTime('endTime', '结束时间', { required: true }),
      text('destination', '目的地', { required: true, filter: true }),
      text('reason', '用车事由', { type: 'textarea' }),
      number('passengerCount', '乘车人数'),
      text('passengers', '乘车人员', { table: false }),
      select('status', '状态', usageStatusOptions, { defaultValue: '0', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '同意', tone: 'success', visible: (row) => String(row.status) === '0', run: (row) => approveVehicleUsage(row.usageId || '', true, '同意用车') },
      { label: '驳回', tone: 'danger', visible: (row) => String(row.status) === '0', confirm: () => '确认驳回该用车申请？', run: (row) => approveVehicleUsage(row.usageId || '', false, '驳回用车') },
      { label: '取消', tone: 'warning', visible: (row) => ['0', '1'].includes(String(row.status)), run: (row) => cancelVehicleUsage(row.usageId || '') }
    ]
  },
  {
    path: '/admin/vehicle/usage',
    title: '用车记录',
    eyebrow: 'Vehicle Usage',
    description: '查看车辆使用过程、里程和归还状态',
    icon: Car,
    basePath: '/oa/vehicle/usage',
    idKey: 'usageId',
    primaryKey: 'destination',
    searchPlaceholder: '目的地/申请人',
    fields: [
      text('vehiclePlate', '车辆', { hiddenInForm: true }),
      text('applicantName', '申请人', { hiddenInForm: true, filter: true }),
      dateTime('startTime', '开始时间'),
      dateTime('endTime', '结束时间'),
      text('destination', '目的地', { filter: true }),
      number('startMileage', '起始里程'),
      number('endMileage', '结束里程'),
      select('status', '状态', usageStatusOptions, { filter: true, hiddenInForm: true })
    ],
    readOnly: true,
    actions: [
      { label: '归还', tone: 'success', visible: (row) => ['1', '3'].includes(String(row.status)), run: (row) => confirmVehicleReturn(row.usageId || '', Number(row.endMileage || row.startMileage || 0), '完成还车') }
    ]
  },
  {
    path: '/admin/visitor',
    title: '访客管理',
    eyebrow: 'Visitor',
    description: '管理访客预约、到访确认、签到和签退',
    icon: UserCheck,
    basePath: '/oa/visitor',
    idKey: 'visitorId',
    primaryKey: 'visitorName',
    searchPlaceholder: '访客/公司/被访人',
    fields: [
      text('visitorName', '访客姓名', { required: true, filter: true }),
      text('visitorPhone', '电话'),
      text('visitorCompany', '访客单位', { filter: true }),
      number('visitorCount', '人数', { defaultValue: 1 }),
      text('visitReason', '来访事由', { type: 'textarea' }),
      text('hostName', '被访人', { filter: true }),
      text('hostDept', '被访部门'),
      date('visitDate', '来访日期', { required: true }),
      text('visitTimeStart', '开始时间'),
      text('visitTimeEnd', '结束时间'),
      text('visitArea', '访问区域'),
      select('status', '状态', visitorStatusOptions, { defaultValue: 'PENDING', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '确认', tone: 'success', visible: (row) => String(row.status) === 'PENDING', run: (row) => confirmVisitor(row.visitorId || '') },
      { label: '签到', tone: 'success', visible: (row) => String(row.status) === 'CONFIRMED', run: (row) => checkInVisitor(row.visitorId || '') },
      { label: '签退', tone: 'success', visible: (row) => String(row.status) === 'ARRIVED', run: (row) => checkOutVisitor(row.visitorId || '') },
      { label: '取消', tone: 'warning', visible: (row) => ['PENDING', 'CONFIRMED'].includes(String(row.status)), run: (row) => cancelVisitor(row.visitorId || '') }
    ]
  },
  {
    path: '/admin/duty-schedule',
    title: '值班排班',
    eyebrow: 'Duty Schedule',
    description: '维护日常、节假日和应急值班排班',
    icon: CalendarClock,
    basePath: '/oa/duty',
    idKey: 'scheduleId',
    primaryKey: 'title',
    searchPlaceholder: '标题/值班人/部门',
    fields: [
      text('title', '排班标题', { required: true, filter: true }),
      select('scheduleType', '排班类型', [{ value: 'DAILY', label: '日常值班' }, { value: 'HOLIDAY', label: '节假日值班' }, { value: 'EMERGENCY', label: '应急值班' }], { defaultValue: 'DAILY' }),
      date('dutyDate', '值班日期', { required: true }),
      select('shiftType', '班次', [{ value: 'DAY', label: '白班' }, { value: 'NIGHT', label: '夜班' }, { value: 'FULL', label: '全天' }], { defaultValue: 'DAY' }),
      text('startTime', '开始时间'),
      text('endTime', '结束时间'),
      number('userId', '值班人ID'),
      text('userName', '值班人', { filter: true }),
      text('deptName', '部门', { filter: true }),
      text('location', '值班地点'),
      select('status', '状态', dutyStatusOptions, { defaultValue: 'SCHEDULED', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '签到', tone: 'success', visible: (row) => String(row.status) === 'SCHEDULED', run: (row) => checkInDuty(row.scheduleId || '') },
      { label: '签退', tone: 'success', visible: (row) => String(row.status) === 'CHECKED_IN', run: (row) => checkOutDuty(row.scheduleId || '') }
    ]
  },
  {
    path: '/admin/supplier',
    title: '供应商管理',
    eyebrow: 'Supplier',
    description: '维护行政采购供应商、联系人和付款账户',
    icon: Handshake,
    basePath: '/oa/supplier',
    idKey: 'supplierId',
    primaryKey: 'supplierName',
    searchPlaceholder: '供应商/联系人/电话',
    fields: [
      text('supplierName', '供应商名称', { required: true, filter: true }),
      text('contactName', '联系人', { filter: true }),
      text('contactPhone', '联系电话'),
      text('bankName', '开户行'),
      text('bankAccount', '银行账号'),
      select('status', '状态', activeOptions, { defaultValue: 'ACTIVE', filter: true })
    ]
  },
  {
    path: '/admin/consumable',
    title: '耗材管理',
    eyebrow: 'Consumable',
    description: '维护耗材目录、库存数量和低库存预警',
    icon: Package,
    basePath: '/oa/consumable',
    idKey: 'consumableId',
    primaryKey: 'name',
    searchPlaceholder: '耗材名称/型号',
    fields: [
      text('name', '耗材名称', { required: true, filter: true }),
      text('model', '型号', { filter: true }),
      text('unit', '单位', { defaultValue: '件' }),
      number('quantity', '库存', { hiddenInForm: true }),
      number('lowStockThreshold', '低库存阈值', { defaultValue: 10 }),
      number('targetStock', '目标库存', { defaultValue: 20 }),
      number('defaultSupplierId', '默认供应商ID'),
      select('warnEnabled', '预警', [{ value: '', label: '全部' }, { value: 1, label: '启用' }, { value: 0, label: '停用' }], { defaultValue: 1, filter: true })
    ],
    actions: [
      { label: '入库', tone: 'success', run: (row) => addConsumableStock(row.consumableId || '', 1, '前端快捷入库') },
      { label: '出库', tone: 'warning', visible: (row) => Number(row.quantity || 0) > 0, run: (row) => reduceConsumableStock(row.consumableId || '', 1, 'ISSUE', '前端快捷出库') }
    ]
  },
  {
    path: '/admin/seal',
    title: '印章台账',
    eyebrow: 'Seal Ledger',
    description: '维护印章编码、保管人、位置和可用状态',
    icon: Stamp,
    basePath: '/oa/seal',
    idKey: 'sealId',
    primaryKey: 'sealName',
    searchPlaceholder: '印章名称/编码/保管人',
    fields: [
      text('sealCode', '印章编码', { required: true, filter: true }),
      text('sealName', '印章名称', { required: true, filter: true }),
      select('sealType', '印章类型', sealTypeOptions, { defaultValue: 'COMPANY', status: false }),
      number('keeperId', '保管人ID'),
      text('keeperName', '保管人', { filter: true }),
      text('location', '存放位置'),
      select('status', '状态', resourceStatusOptions, { defaultValue: 'AVAILABLE', filter: true, formOptions: editableResourceStatusOptions }),
      dateTime('borrowDueTime', '预计归还', { hiddenInForm: true })
    ],
    lockWhen: (row) => String(row.status) === 'BORROWED',
    lockMessage: '借出中的印章只能在借还管理归还'
  },
  {
    path: '/admin/license',
    title: '证照台账',
    eyebrow: 'License Ledger',
    description: '维护证照编码、编号、签发方和到期日期',
    icon: BadgeCheck,
    basePath: '/oa/license',
    idKey: 'licenseId',
    primaryKey: 'licenseName',
    searchPlaceholder: '证照名称/编号/保管人',
    fields: [
      text('licenseCode', '证照编码', { required: true, filter: true }),
      text('licenseName', '证照名称', { required: true, filter: true }),
      select('licenseType', '证照类型', licenseTypeOptions, { defaultValue: 'BUSINESS', status: false }),
      text('licenseNo', '证照编号', { filter: true }),
      text('issuer', '签发机关'),
      date('issueDate', '签发日期'),
      date('expireDate', '到期日期'),
      text('keeperName', '保管人'),
      text('location', '存放位置'),
      select('status', '状态', resourceStatusOptions, { defaultValue: 'AVAILABLE', filter: true, formOptions: editableResourceStatusOptions })
    ],
    lockWhen: (row) => String(row.status) === 'BORROWED',
    lockMessage: '借出中的证照只能在借还管理归还'
  },
  {
    path: '/office/license-borrow',
    title: '证照借用',
    eyebrow: 'License Borrow',
    description: '提交和跟踪证照借用审批与归还状态',
    icon: RotateCcw,
    basePath: '/oa/license/borrow',
    idKey: 'id',
    primaryKey: 'licenseName',
    searchPlaceholder: '证照/借用人/用途',
    fields: [
      text('borrowNo', '借用编号', { hiddenInForm: true }),
      number('licenseId', '证照ID', { required: true }),
      text('licenseName', '证照名称', { hiddenInForm: true, filter: true }),
      number('userId', '借用人ID'),
      text('userName', '借用人', { filter: true }),
      text('deptName', '部门'),
      text('purpose', '用途', { type: 'textarea', filter: true }),
      dateTime('expectedBorrowTime', '预计借出'),
      dateTime('expectedReturnTime', '预计归还'),
      select('status', '状态', borrowStatusOptions, { defaultValue: 'DRAFT', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', run: (row) => submitLicenseBorrow(row.id || '') },
      { label: '借出', tone: 'success', visible: (row) => ['APPROVED', 'PENDING'].includes(String(row.status)), run: (row) => confirmLicenseBorrow(row.id || '', '确认借出') },
      { label: '归还', tone: 'success', visible: (row) => String(row.status) === 'BORROWED', run: (row) => confirmLicenseReturn(row.id || '', '确认归还') },
      { label: '催还', tone: 'warning', visible: (row) => String(row.status) === 'BORROWED', run: (row) => remindLicenseBorrow(row.id || '', '请及时归还') },
      { label: '取消', tone: 'warning', visible: (row) => ['DRAFT', 'PENDING'].includes(String(row.status)), run: (row) => cancelLicenseBorrow(row.id || '') }
    ]
  },
  {
    path: '/admin/risk-alerts',
    title: '风险预警',
    eyebrow: 'Risk Alerts',
    description: '跟踪合同、证照、借还等业务风险状态',
    icon: ShieldAlert,
    basePath: '/oa/risk',
    createPath: '/oa/risk/manual',
    idKey: 'id',
    primaryKey: 'riskName',
    searchPlaceholder: '风险名称/业务类型/负责人',
    fields: [
      text('businessType', '业务类型', { required: true, filter: true }),
      number('businessId', '业务ID'),
      text('riskCode', '风险编码', { required: true }),
      text('riskName', '风险名称', { required: true, filter: true }),
      select('riskLevel', '风险等级', riskLevelOptions, { defaultValue: 'MEDIUM', filter: true }),
      select('riskStatus', '状态', riskStatusOptions, { defaultValue: 'OPEN', filter: true }),
      text('ownerName', '负责人', { filter: true }),
      dateTime('detectedTime', '发现时间', { hiddenInForm: true })
    ],
    updatePath: '',
    deletePath: '',
    actions: [
      { label: '处理中', tone: 'warning', visible: (row) => String(row.riskStatus) === 'OPEN', run: (row) => updateRiskStatus(row.id || '', 'HANDLING', '已开始处理') },
      { label: '关闭', tone: 'success', visible: (row) => String(row.riskStatus) !== 'CLOSED', run: (row) => updateRiskStatus(row.id || '', 'CLOSED', '处理完成') },
      { label: '忽略', tone: 'ghost', visible: (row) => String(row.riskStatus) !== 'IGNORED', run: (row) => updateRiskStatus(row.id || '', 'IGNORED', '忽略风险') }
    ]
  },
  {
    path: '/admin/seal-application',
    title: '用印申请',
    eyebrow: 'Seal Application',
    description: '提交和跟踪用印借出归还流程',
    icon: Stamp,
    basePath: '/oa/seal/application',
    idKey: 'id',
    primaryKey: 'documentName',
    searchPlaceholder: '文件/印章/申请人',
    fields: [
      text('applicationNo', '申请编号', { hiddenInForm: true }),
      number('sealId', '印章ID', { required: true }),
      text('sealName', '印章名称', { hiddenInForm: true }),
      text('documentName', '文件名称', { required: true, filter: true }),
      text('userName', '申请人', { hiddenInForm: true, filter: true }),
      number('copyCount', '份数', { defaultValue: 1 }),
      text('purpose', '用途', { type: 'textarea' }),
      dateTime('expectedBorrowTime', '预计借出'),
      dateTime('expectedReturnTime', '预计归还'),
      select('status', '状态', borrowStatusOptions, { defaultValue: 'DRAFT', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', run: (row) => submitSealApplication(row.id || '') },
      { label: '借出', tone: 'success', visible: (row) => ['APPROVED', 'PENDING'].includes(String(row.status)), run: (row) => confirmSealBorrow(row.id || '', '确认借出') },
      { label: '归还', tone: 'success', visible: (row) => String(row.status) === 'BORROWED', run: (row) => confirmSealReturn(row.id || '', '确认归还') },
      { label: '催还', tone: 'warning', visible: (row) => String(row.status) === 'BORROWED', run: (row) => remindSealApplication(row.id || '', '请及时归还') },
      { label: '取消', tone: 'warning', visible: (row) => ['DRAFT', 'PENDING'].includes(String(row.status)), run: (row) => cancelSealApplication(row.id || '') }
    ]
  },
  {
    path: '/meeting-room',
    title: '会议室',
    eyebrow: 'Meeting Room',
    description: '维护会议室容量、位置、设备和可用状态',
    icon: CalendarClock,
    basePath: '/oa/meeting-room',
    idKey: 'roomId',
    primaryKey: 'name',
    searchPlaceholder: '会议室名称/位置',
    fields: [
      text('name', '会议室名称', { required: true, filter: true }),
      number('capacity', '容量', { required: true }),
      text('location', '位置', { filter: true }),
      text('equipment', '设备', { type: 'textarea' }),
      select('status', '状态', [{ value: '', label: '全部状态' }, { value: '1', label: '可用' }, { value: '0', label: '维护中' }], { defaultValue: '1', filter: true })
    ]
  },
  {
    path: '/office/business-trip',
    title: '出差申请',
    eyebrow: 'Business Trip',
    description: '提交和跟踪出差申请、行程安排与预计费用',
    icon: CalendarClock,
    basePath: '/oa/business-trip',
    idKey: 'id',
    primaryKey: 'destination',
    searchPlaceholder: '目的地/申请人/项目',
    fields: [
      text('tripNo', '出差单号', { hiddenInForm: true }),
      text('userName', '申请人', { hiddenInForm: true, filter: true }),
      text('departure', '出发地', { required: true }),
      text('destination', '目的地', { required: true, filter: true }),
      date('startDate', '开始日期', { required: true }),
      date('endDate', '结束日期', { required: true }),
      number('tripDays', '天数'),
      select('transportType', '交通方式', tripTransportOptions, { defaultValue: 'TRAIN', status: false }),
      number('estimatedCost', '预计费用'),
      text('projectName', '项目名称', { filter: true }),
      text('reason', '出差事由', { type: 'textarea' }),
      select('status', '状态', workflowStatusOptions, { defaultValue: 'DRAFT', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', run: (row) => submitOaRecord('/oa/business-trip', row.id || '') },
      { label: '取消', tone: 'warning', visible: (row) => ['DRAFT', 'PENDING'].includes(String(row.status)), run: (row) => cancelOaRecord('/oa/business-trip', row.id || '') }
    ]
  },
  {
    path: '/expense/claim',
    title: '报销申请',
    eyebrow: 'Expense Claim',
    description: '提交和跟踪费用报销申请、类别与打款状态',
    icon: Package,
    basePath: '/oa/expense/claim',
    idKey: 'id',
    primaryKey: 'claimNo',
    searchPlaceholder: '报销单号/申请人/说明',
    fields: [
      text('claimNo', '报销单号', { hiddenInForm: true }),
      text('userName', '申请人', { hiddenInForm: true, filter: true }),
      select('category', '报销类别', expenseCategoryOptions, { defaultValue: 'TRAVEL', filter: true, status: false }),
      number('totalAmount', '总金额', { required: true }),
      text('description', '报销说明', { type: 'textarea', filter: true }),
      select('status', '状态', workflowStatusOptions, { defaultValue: 'DRAFT', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', run: (row) => submitOaRecord('/oa/expense/claim', row.id || '') }
    ]
  },
  {
    path: '/payment/request',
    title: '付款申请',
    eyebrow: 'Payment Request',
    description: '提交和跟踪供应商、服务、租金等付款申请',
    icon: Package,
    basePath: '/oa/payment/request',
    idKey: 'id',
    primaryKey: 'paymentNo',
    searchPlaceholder: '付款单号/收款方/申请人',
    fields: [
      text('paymentNo', '付款单号', { hiddenInForm: true }),
      text('userName', '申请人', { hiddenInForm: true, filter: true }),
      text('payeeName', '收款方', { required: true, filter: true }),
      text('payeeAccount', '收款账号'),
      text('payeeBank', '开户行'),
      number('amount', '付款金额', { required: true }),
      select('paymentType', '付款类型', paymentTypeOptions, { defaultValue: 'PURCHASE', filter: true, status: false }),
      dateTime('expectedDate', '期望付款日期'),
      text('reason', '付款事由', { type: 'textarea' }),
      select('status', '状态', workflowStatusOptions, { defaultValue: 'DRAFT', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', run: (row) => submitOaRecord('/oa/payment/request', row.id || '') },
      { label: '确认付款', tone: 'success', visible: (row) => String(row.status) === 'APPROVED', run: (row) => confirmPaymentRequest(row.id || '') }
    ]
  },
  {
    path: '/office/purchase-request',
    title: '采购申请',
    eyebrow: 'Purchase Request',
    description: '提交和跟踪行政采购、供应商与付款联动',
    icon: Handshake,
    basePath: '/oa/purchase/request',
    idKey: 'id',
    primaryKey: 'purchaseNo',
    searchPlaceholder: '采购单号/供应商/申请人',
    fields: [
      text('purchaseNo', '采购单号', { hiddenInForm: true }),
      text('userName', '申请人', { hiddenInForm: true, filter: true }),
      number('supplierId', '供应商ID'),
      text('supplierName', '供应商', { filter: true }),
      text('supplierContact', '联系人'),
      text('supplierPhone', '联系电话'),
      number('totalAmount', '采购金额', { required: true }),
      dateTime('expectedDate', '期望到货'),
      text('reason', '采购原因', { type: 'textarea' }),
      select('status', '状态', workflowStatusOptions, { defaultValue: 'DRAFT', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', run: (row) => submitOaRecord('/oa/purchase/request', row.id || '') },
      { label: '入库', tone: 'success', visible: (row) => String(row.status) === 'APPROVED', run: (row) => receivePurchaseRequest(row.id || '') },
      { label: '生成付款', tone: 'warning', visible: (row) => String(row.status) === 'APPROVED', run: async (row) => { await createPurchasePaymentRequest(row.id || '') } }
    ]
  },
  {
    path: '/office/seal-application',
    title: '用印申请',
    eyebrow: 'Seal Application',
    description: '提交和跟踪合同、文件用印借出归还流程',
    icon: Stamp,
    basePath: '/oa/seal/application',
    idKey: 'id',
    primaryKey: 'documentName',
    searchPlaceholder: '文件/印章/申请人',
    fields: [
      text('applicationNo', '申请编号', { hiddenInForm: true }),
      number('sealId', '印章ID', { required: true }),
      text('sealName', '印章名称', { hiddenInForm: true }),
      text('documentName', '文件名称', { required: true, filter: true }),
      text('userName', '申请人', { hiddenInForm: true, filter: true }),
      text('useScene', '用印场景'),
      number('copyCount', '份数', { defaultValue: 1 }),
      text('purpose', '用途', { type: 'textarea' }),
      dateTime('expectedBorrowTime', '预计借出'),
      dateTime('expectedReturnTime', '预计归还'),
      select('status', '状态', borrowStatusOptions, { defaultValue: 'DRAFT', filter: true, hiddenInForm: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', run: (row) => submitSealApplication(row.id || '') },
      { label: '借出', tone: 'success', visible: (row) => ['APPROVED', 'PENDING'].includes(String(row.status)), run: (row) => confirmSealBorrow(row.id || '', '确认借出') },
      { label: '归还', tone: 'success', visible: (row) => String(row.status) === 'BORROWED', run: (row) => confirmSealReturn(row.id || '', '确认归还') },
      { label: '取消', tone: 'warning', visible: (row) => ['DRAFT', 'PENDING'].includes(String(row.status)), run: (row) => cancelSealApplication(row.id || '') }
    ]
  },
  {
    path: '/office/contracts',
    title: '合同台账',
    eyebrow: 'Contract Ledger',
    description: '维护合同编号、相对方、金额、期限与风险等级',
    icon: Handshake,
    basePath: '/oa/contract',
    idKey: 'contractId',
    primaryKey: 'contractName',
    searchPlaceholder: '合同名称/编号/相对方',
    fields: [
      text('contractNo', '合同编号', { required: true, filter: true }),
      text('contractName', '合同名称', { required: true, filter: true }),
      text('counterpartyName', '相对方', { required: true, filter: true }),
      text('contractType', '合同类型'),
      number('amount', '合同金额'),
      text('currency', '币种', { defaultValue: 'CNY' }),
      text('ownerName', '负责人', { filter: true }),
      text('deptName', '部门'),
      date('startDate', '开始日期'),
      date('endDate', '结束日期'),
      select('riskLevel', '风险等级', riskLevelSelectOptions, { defaultValue: 'LOW', filter: true }),
      select('status', '状态', contractStatusOptions, { defaultValue: 'DRAFT', filter: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', run: (row) => submitOaRecord('/oa/contract', row.contractId || '') },
      { label: '取消', tone: 'warning', visible: (row) => ['DRAFT', 'PENDING'].includes(String(row.status)), run: (row) => cancelOaRecord('/oa/contract', row.contractId || '') }
    ]
  }
]

export const adminPageConfigByPath = new Map(adminPageConfigs.map((config) => [config.path, config]))
