import { BarChart3, BriefcaseBusiness, CircleDollarSign, Headphones, Package, ReceiptText, RefreshCcw, Target, UserRound, UsersRound } from 'lucide-vue-next'
import {
  activeOptions,
  date,
  dateTime,
  number,
  select,
  text,
  workflowOptions,
  type RecordPageConfig
} from '@/pages/shared/recordPageConfig'
import { CRM_PERMISSIONS } from '@/permissions'

const customerLevelOptions = [
  { value: '', label: '全部等级' },
  { value: 'A', label: 'A 级' },
  { value: 'B', label: 'B 级' },
  { value: 'C', label: 'C 级' },
  { value: 'D', label: 'D 级' }
]

const opportunityStageOptions = [
  { value: '', label: '全部阶段' },
  { value: 'LEAD', label: '线索' },
  { value: 'CONTACT', label: '接洽' },
  { value: 'PROPOSAL', label: '方案' },
  { value: 'NEGOTIATION', label: '谈判' },
  { value: 'WON', label: '赢单' },
  { value: 'LOST', label: '输单' }
]

const crmConfig = (
  config: Omit<RecordPageConfig, 'eyebrow' | 'searchPlaceholder'>
): RecordPageConfig => ({
  eyebrow: 'CRM',
  searchPlaceholder: '名称/编号/负责人',
  ...config
})

export const crmPageConfigs: RecordPageConfig[] = [
  crmConfig({
    path: '/office/crm',
    title: 'CRM 工作台',
    description: '集中查看客户、商机、应收和服务工单，承接 React 原版 CRM 入口。',
    icon: BarChart3,
    listPath: '/crm/customer/list',
    createPath: '/crm/customer',
    updatePath: '/crm/customer',
    deletePath: '/crm/customer',
    idKey: 'customerId',
    primaryKey: 'customerName',
    fields: [
      text('customerName', '客户名称', { required: true, filter: true }),
      text('customerNo', '客户编号', { filter: true }),
      select('level', '等级', customerLevelOptions, { filter: true }),
      text('ownerName', '负责人', { filter: true }),
      text('phone', '电话'),
      text('industry', '行业'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  crmConfig({
    path: '/office/crm/customers',
    title: '客户管理',
    description: '维护客户档案、等级、归属和当前跟进状态。',
    icon: UsersRound,
    listPath: '/crm/customer/list',
    createPath: '/crm/customer',
    updatePath: '/crm/customer',
    deletePath: '/crm/customer',
    idKey: 'customerId',
    primaryKey: 'customerName',
    fields: [
      text('customerName', '客户名称', { required: true, filter: true }),
      text('customerNo', '客户编号', { filter: true }),
      select('level', '等级', customerLevelOptions, { filter: true }),
      text('ownerName', '负责人', { filter: true }),
      text('phone', '联系电话'),
      text('address', '地址'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  crmConfig({
    path: '/office/crm/leads',
    title: '线索管理',
    description: '登记线索来源、客户意向和转化状态。',
    icon: UserRound,
    listPath: '/crm/lead/list',
    createPath: '/crm/lead',
    updatePath: '/crm/lead',
    deletePath: '/crm/lead',
    idKey: 'leadId',
    primaryKey: 'leadName',
    fields: [
      text('leadName', '线索名称', { required: true, filter: true }),
      text('customerName', '客户名称', { filter: true }),
      text('source', '来源', { filter: true }),
      text('ownerName', '负责人'),
      text('phone', '电话'),
      select('status', '状态', workflowOptions, { filter: true })
    ],
    actions: [
      { label: '转化', tone: 'success', path: () => '/crm/lead/convert', payload: (row) => ({ leadId: row.leadId }), permission: CRM_PERMISSIONS.LEAD_CONVERT }
    ]
  }),
  crmConfig({
    path: '/office/crm/opportunities',
    title: '商机管理',
    description: '跟进销售机会、阶段、金额和赢输单状态。',
    icon: BriefcaseBusiness,
    listPath: '/crm/opportunity/list',
    createPath: '/crm/opportunity',
    updatePath: '/crm/opportunity',
    deletePath: '/crm/opportunity',
    idKey: 'opportunityId',
    primaryKey: 'opportunityName',
    fields: [
      text('opportunityName', '商机名称', { required: true, filter: true }),
      text('customerName', '客户', { filter: true }),
      number('amount', '预计金额'),
      select('stage', '阶段', opportunityStageOptions, { filter: true }),
      text('ownerName', '负责人'),
      date('expectedCloseDate', '预计成交')
    ],
    actions: [
      { label: '赢单', tone: 'success', visible: (row) => String(row.stage) !== 'WON', path: (row) => `/crm/opportunity/${row.opportunityId}/win`, permission: CRM_PERMISSIONS.OPPORTUNITY_WIN },
      { label: '输单', tone: 'danger', visible: (row) => String(row.stage) !== 'LOST', path: (row) => `/crm/opportunity/${row.opportunityId}/lose`, payload: () => ({ lostReason: '业务确认输单' }), permission: CRM_PERMISSIONS.OPPORTUNITY_LOSE }
    ]
  }),
  crmConfig({
    path: '/office/crm/quotes',
    title: '报价管理',
    description: '维护客户报价、发送状态和合同草稿转换。',
    icon: ReceiptText,
    listPath: '/crm/quote/list',
    createPath: '/crm/quote',
    updatePath: '/crm/quote',
    deletePath: '/crm/quote',
    idKey: 'quoteId',
    primaryKey: 'quoteNo',
    fields: [
      text('quoteNo', '报价单号', { filter: true }),
      text('customerName', '客户', { filter: true }),
      number('totalAmount', '报价金额'),
      select('status', '状态', workflowOptions, { filter: true }),
      dateTime('validUntil', '有效期'),
      text('ownerName', '负责人')
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', path: (row) => `/crm/quote/submit/${row.quoteId}`, permission: CRM_PERMISSIONS.QUOTE_SUBMIT },
      { label: '发送', tone: 'warning', path: (row) => `/crm/quote/${row.quoteId}/send`, permission: CRM_PERMISSIONS.QUOTE_SEND }
    ]
  }),
  crmConfig({
    path: '/office/crm/receivables',
    title: '应收管理',
    description: '跟踪客户应收、开票绑定和核销状态。',
    icon: CircleDollarSign,
    listPath: '/crm/receivable/list',
    createPath: '/crm/receivable',
    updatePath: '/crm/receivable',
    deletePath: '/crm/receivable',
    idKey: 'receivableId',
    primaryKey: 'receivableNo',
    fields: [
      text('receivableNo', '应收编号', { filter: true }),
      text('customerName', '客户', { filter: true }),
      number('amount', '金额'),
      number('paidAmount', '已收'),
      date('dueDate', '到期日'),
      select('status', '状态', workflowOptions, { filter: true })
    ],
    actions: [
      { label: '确认', tone: 'success', path: (row) => `/crm/receivable/${row.receivableId}/confirm`, permission: CRM_PERMISSIONS.RECEIVABLE_CONFIRM }
    ]
  }),
  crmConfig({
    path: '/office/crm/renewals',
    title: '续约管理',
    description: '维护续约机会、续约金额和审批流状态。',
    icon: RefreshCcw,
    listPath: '/crm/renewal/list',
    createPath: '/crm/renewal',
    updatePath: '/crm/renewal',
    deletePath: '/crm/renewal',
    idKey: 'renewalId',
    primaryKey: 'renewalNo',
    fields: [
      text('renewalNo', '续约编号', { filter: true }),
      text('customerName', '客户', { filter: true }),
      number('renewalAmount', '续约金额'),
      date('renewalDate', '续约日期'),
      text('ownerName', '负责人'),
      select('status', '状态', workflowOptions, { filter: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', path: (row) => `/crm/renewal/submit/${row.renewalId}`, permission: CRM_PERMISSIONS.RENEWAL_SUBMIT }
    ]
  }),
  crmConfig({
    path: '/office/crm/tickets',
    title: '服务工单',
    description: '处理客户服务工单、SLA 和关闭状态。',
    icon: Headphones,
    listPath: '/crm/ticket/list',
    createPath: '/crm/ticket',
    updatePath: '/crm/ticket',
    deletePath: '/crm/ticket',
    idKey: 'ticketId',
    primaryKey: 'ticketTitle',
    fields: [
      text('ticketTitle', '工单标题', { required: true, filter: true }),
      text('customerName', '客户', { filter: true }),
      text('priority', '优先级'),
      text('assigneeName', '处理人'),
      select('status', '状态', workflowOptions, { filter: true })
    ],
    actions: [
      { label: '解决', tone: 'success', path: (row) => `/crm/ticket/${row.ticketId}/resolve`, payload: () => ({ solution: '问题已解决' }), permission: CRM_PERMISSIONS.TICKET_RESOLVE },
      { label: '关闭', tone: 'warning', path: (row) => `/crm/ticket/${row.ticketId}/close`, permission: CRM_PERMISSIONS.TICKET_CLOSE }
    ]
  }),
  crmConfig({
    path: '/office/crm/products',
    title: '产品管理',
    description: '维护产品目录、价格和启停状态。',
    icon: Package,
    listPath: '/crm/product/list',
    createPath: '/crm/product',
    updatePath: '/crm/product',
    deletePath: '/crm/product',
    idKey: 'productId',
    primaryKey: 'productName',
    fields: [
      text('productName', '产品名称', { required: true, filter: true }),
      text('productCode', '产品编码', { filter: true }),
      number('standardPrice', '标准价'),
      text('unit', '单位'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  crmConfig({
    path: '/office/crm/price-books',
    title: '价目表',
    description: '维护产品价目、适用客户等级和有效期。',
    icon: ReceiptText,
    listPath: '/crm/price-book/list',
    createPath: '/crm/price-book',
    updatePath: '/crm/price-book',
    deletePath: '/crm/price-book',
    idKey: 'priceBookId',
    primaryKey: 'priceBookName',
    fields: [
      text('priceBookName', '价目表名称', { required: true, filter: true }),
      text('priceBookCode', '编码', { filter: true }),
      date('effectiveDate', '生效日期'),
      date('expireDate', '失效日期'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  crmConfig({
    path: '/office/crm/sales-targets',
    title: '销售目标',
    description: '维护人员或部门销售目标、周期和完成状态。',
    icon: Target,
    listPath: '/crm/sales-target/list',
    createPath: '/crm/sales-target',
    updatePath: '/crm/sales-target',
    deletePath: '/crm/sales-target',
    idKey: 'targetId',
    primaryKey: 'targetName',
    fields: [
      text('targetName', '目标名称', { required: true, filter: true }),
      text('ownerName', '负责人', { filter: true }),
      text('period', '周期'),
      number('targetAmount', '目标金额'),
      number('actualAmount', '已完成'),
      select('status', '状态', workflowOptions, { filter: true })
    ]
  }),
  crmConfig({
    path: '/office/crm/customer-pool',
    title: '客户公海',
    description: '查看可领取客户、释放记录和分配状态。',
    icon: UsersRound,
    listPath: '/crm/customer-pool/list',
    idKey: 'customerId',
    primaryKey: 'customerName',
    readOnly: true,
    fields: [
      text('customerName', '客户名称', { filter: true }),
      text('customerNo', '客户编号', { filter: true }),
      text('level', '等级'),
      text('ownerName', '当前负责人'),
      dateTime('releasedTime', '释放时间'),
      select('status', '状态', activeOptions, { filter: true })
    ],
    actions: [
      { label: '领取', tone: 'success', path: (row) => `/crm/customer-pool/${row.customerId}/claim`, payload: () => ({ reason: '业务领取' }), permission: CRM_PERMISSIONS.CUSTOMER_POOL_CLAIM }
    ]
  }),
  crmConfig({
    path: '/office/crm/assignment-rules',
    title: '分配规则',
    description: '维护客户自动分配规则、优先级和启停状态。',
    icon: Target,
    listPath: '/crm/assignment-rule/list',
    createPath: '/crm/assignment-rule',
    updatePath: '/crm/assignment-rule',
    deletePath: '/crm/assignment-rule',
    idKey: 'ruleId',
    primaryKey: 'ruleName',
    fields: [
      text('ruleName', '规则名称', { required: true, filter: true }),
      text('ruleCode', '规则编码', { filter: true }),
      text('scopeType', '范围'),
      number('priority', '优先级'),
      select('status', '状态', activeOptions, { filter: true }),
      text('remark', '说明', { type: 'textarea', table: false })
    ]
  })
]

export const crmPageConfigByPath = new Map(crmPageConfigs.map((config) => [config.path, config]))
