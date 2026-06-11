import { Banknote, FileSpreadsheet, FileText, GitBranch, Landmark, ReceiptText } from 'lucide-vue-next'
import {
  date,
  dateTime,
  number,
  select,
  text,
  workflowOptions,
  type RecordPageConfig
} from '@/pages/shared/recordPageConfig'

const directionOptions = [
  { value: '', label: '全部方向' },
  { value: 'IN', label: '进项' },
  { value: 'OUT', label: '销项' }
]

const riskOptions = [
  { value: '', label: '全部等级' },
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '严重' }
]

const oaConfig = (
  config: Omit<RecordPageConfig, 'eyebrow' | 'searchPlaceholder'>
): RecordPageConfig => ({
  eyebrow: 'OA Business',
  searchPlaceholder: '名称/编号/关键字',
  ...config
})

export const oaBusinessPageConfigs: RecordPageConfig[] = [
  oaConfig({
    path: '/office/meeting-minutes',
    title: '会议纪要',
    description: '维护会议纪要、决议、附件和确认状态。',
    icon: FileText,
    listPath: '/oa/meeting/minutes/page',
    createPath: '/oa/meeting/minutes',
    updatePath: '/oa/meeting/minutes',
    deletePath: '/oa/meeting/minutes',
    deleteMode: 'single',
    idKey: 'id',
    primaryKey: 'meetingTitle',
    fields: [
      text('meetingTitle', '会议标题', { required: true, filter: true }),
      dateTime('meetingTime', '会议时间'),
      text('location', '地点', { filter: true }),
      text('organizerName', '组织人'),
      select('status', '状态', workflowOptions, { filter: true }),
      text('minutesContent', '纪要内容', { type: 'textarea', table: false })
    ],
    actions: [
      { label: '确认', tone: 'success', path: (row) => `/oa/meeting/minutes/${row.id}/confirm` },
      { label: '派发决议', tone: 'warning', path: (row) => `/oa/meeting/minutes/${row.id}/dispatch-decisions`, payload: () => ({}) }
    ]
  }),
  oaConfig({
    path: '/office/project',
    title: '项目管理',
    description: '维护项目主数据、负责人、周期、预算和风险等级。',
    icon: Landmark,
    listPath: '/oa/project/list',
    createPath: '/oa/project',
    updatePath: '/oa/project',
    deletePath: '/oa/project',
    idKey: 'projectId',
    primaryKey: 'projectName',
    fields: [
      text('projectName', '项目名称', { required: true, filter: true }),
      text('projectNo', '项目编号', { filter: true }),
      text('customerName', '客户', { filter: true }),
      text('ownerName', '负责人'),
      date('startDate', '开始日期'),
      date('endDate', '结束日期'),
      number('budgetAmount', '预算'),
      select('riskLevel', '风险', riskOptions, { filter: true }),
      select('status', '状态', workflowOptions, { filter: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', path: (row) => `/oa/project/submit/${row.projectId}` },
      { label: '归档', tone: 'warning', path: (row) => `/oa/project/archive/${row.projectId}` }
    ]
  }),
  oaConfig({
    path: '/admin/project-wbs',
    title: '项目 WBS',
    description: '项目 WBS 是项目详情子资源，当前入口先展示项目列表并承接 WBS 管理能力。',
    icon: GitBranch,
    listPath: '/oa/project/list',
    readOnly: true,
    idKey: 'projectId',
    primaryKey: 'projectName',
    fields: [
      text('projectName', '项目名称', { filter: true }),
      text('projectNo', '项目编号', { filter: true }),
      text('ownerName', '负责人'),
      number('progress', '进度'),
      select('status', '状态', workflowOptions, { filter: true })
    ]
  }),
  oaConfig({
    path: '/office/budget',
    title: '预算管理',
    description: '维护预算计划、预算金额、执行金额和审批状态。',
    icon: Banknote,
    listPath: '/oa/budget/plan/list',
    createPath: '/oa/budget/plan',
    updatePath: '/oa/budget/plan',
    idKey: 'budgetId',
    primaryKey: 'budgetName',
    fields: [
      text('budgetName', '预算名称', { required: true, filter: true }),
      text('budgetNo', '预算编号', { filter: true }),
      number('fiscalYear', '年度', { filter: true }),
      text('targetName', '对象'),
      number('totalAmount', '总额'),
      number('actualAmount', '已执行'),
      select('status', '状态', workflowOptions, { filter: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', path: (row) => `/oa/budget/plan/submit/${row.budgetId}` }
    ]
  }),
  oaConfig({
    path: '/office/invoice',
    title: '发票管理',
    description: '维护进销项发票、客户合同绑定和核销状态。',
    icon: ReceiptText,
    listPath: '/oa/invoice/list',
    createPath: '/oa/invoice',
    updatePath: '/oa/invoice',
    deletePath: '/oa/invoice',
    idKey: 'invoiceId',
    primaryKey: 'invoiceNo',
    fields: [
      text('invoiceNo', '发票号码', { required: true, filter: true }),
      text('invoiceCode', '发票代码', { filter: true }),
      select('invoiceDirection', '方向', directionOptions, { filter: true, status: false }),
      text('sellerName', '销售方', { filter: true }),
      text('buyerName', '购买方', { filter: true }),
      number('grossAmount', '含税金额'),
      select('status', '状态', workflowOptions, { filter: true })
    ],
    actions: [
      { label: '作废', tone: 'danger', path: (row) => `/oa/invoice/${row.invoiceId}/void`, payload: () => ({ remark: '业务确认作废' }) }
    ]
  }),
  oaConfig({
    path: '/oa/contract-threshold',
    title: '合同金额阈值',
    description: '维护合同金额风险阈值、等级和启停状态。',
    icon: FileSpreadsheet,
    listPath: '/oa/contract/threshold/page',
    createPath: '/oa/contract/threshold',
    updatePath: '/oa/contract/threshold',
    deletePath: '/oa/contract/threshold',
    deleteMode: 'single',
    idKey: 'id',
    primaryKey: 'thresholdName',
    fields: [
      text('thresholdName', '阈值名称', { required: true, filter: true }),
      text('contractType', '合同类型', { filter: true }),
      number('minAmount', '最小金额'),
      number('maxAmount', '最大金额'),
      select('riskLevel', '风险等级', riskOptions, { filter: true }),
      select('status', '状态', workflowOptions, { filter: true })
    ]
  })
]

export const oaBusinessPageConfigByPath = new Map(oaBusinessPageConfigs.map((config) => [config.path, config]))
