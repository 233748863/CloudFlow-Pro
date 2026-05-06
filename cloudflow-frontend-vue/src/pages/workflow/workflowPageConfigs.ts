import {
  Archive,
  BarChart3,
  Bell,
  FileInput,
  FolderTree,
  GitMerge,
  Monitor,
  Rocket,
  Settings,
  Upload
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { SelectOption } from '@/components/common'

export type WorkflowFieldType = 'text' | 'number' | 'date' | 'datetime-local' | 'time' | 'select' | 'textarea'
export type WorkflowTone = 'slate' | 'green' | 'red' | 'yellow' | 'cyan'
export type WorkflowMode = 'definitions' | 'forms' | 'category' | 'deploy' | 'monitor' | 'management' | 'import' | 'archived' | 'alerts' | 'performance'
export type WorkflowAdminRecord = Record<string, string | number | boolean | null | undefined>

export interface WorkflowFieldConfig {
  key: string
  label: string
  type?: WorkflowFieldType
  required?: boolean
  placeholder?: string
  options?: SelectOption[]
  defaultValue?: string | number | boolean | null
  table?: boolean
  filter?: boolean
  hiddenInForm?: boolean
  sortable?: boolean
  status?: boolean
  widthClass?: string
  formatter?: (value: unknown, row: WorkflowAdminRecord) => string
}

export interface WorkflowPageConfig {
  paths: string[]
  title: string
  eyebrow: string
  description: string
  icon: Component
  mode: WorkflowMode
  idKey: string
  primaryKey: string
  searchPlaceholder: string
  fields: WorkflowFieldConfig[]
  readOnly?: boolean
}

const processStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'ARCHIVED', label: '已归档' }
]

const monitorStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'RUNNING', label: '运行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'FAILED', label: '失败' },
  { value: 'TIMEOUT', label: '超时' },
  { value: 'TERMINATED', label: '已终止' }
]

const categoryStatusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: '0', label: '正常' },
  { value: '1', label: '停用' }
]

const booleanOptions: SelectOption[] = [
  { value: '', label: '全部' },
  { value: true, label: '是' },
  { value: false, label: '否' }
]

const deployWindowTypeOptions: SelectOption[] = [
  { value: '', label: '全部类型' },
  { value: 'DAILY', label: '每日' },
  { value: 'WEEKLY', label: '每周' },
  { value: 'MONTHLY', label: '每月' },
  { value: 'CUSTOM', label: '自定义' }
]

const alertLevelOptions: SelectOption[] = [
  { value: '', label: '全部等级' },
  { value: 'REMIND', label: '提醒' },
  { value: 'WARNING', label: '预警' },
  { value: 'CRITICAL', label: '严重' },
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' }
]

const resolvedOptions: SelectOption[] = [
  { value: '', label: '全部' },
  { value: 'false', label: '未解决' },
  { value: 'true', label: '已解决' }
]

const text = (key: string, label: string, extra: Partial<WorkflowFieldConfig> = {}): WorkflowFieldConfig => ({ key, label, type: 'text', table: true, ...extra })
const number = (key: string, label: string, extra: Partial<WorkflowFieldConfig> = {}): WorkflowFieldConfig => ({ key, label, type: 'number', table: true, ...extra })
const date = (key: string, label: string, extra: Partial<WorkflowFieldConfig> = {}): WorkflowFieldConfig => ({ key, label, type: 'date', table: true, ...extra })
const dateTime = (key: string, label: string, extra: Partial<WorkflowFieldConfig> = {}): WorkflowFieldConfig => ({ key, label, type: 'datetime-local', table: true, ...extra })
const time = (key: string, label: string, extra: Partial<WorkflowFieldConfig> = {}): WorkflowFieldConfig => ({ key, label, type: 'time', table: true, ...extra })
const select = (key: string, label: string, options: SelectOption[], extra: Partial<WorkflowFieldConfig> = {}): WorkflowFieldConfig => ({ key, label, type: 'select', options, table: true, status: true, ...extra })

export const optionLabel = (options: SelectOption[] | undefined, value: unknown) => {
  if (typeof value === 'boolean') return value ? '是' : '否'
  return options?.find((item) => String(item.value) === String(value))?.label || String(value ?? '-')
}

export const statusTone = (value: unknown): WorkflowTone => {
  const status = String(value ?? '').toUpperCase()
  if (['PUBLISHED', 'COMPLETED', 'APPROVED', 'ACTIVE', 'SUCCESS', 'Y', 'TRUE', '1', '0'].includes(status)) return 'green'
  if (['DRAFT', 'RUNNING', 'PENDING', 'REMIND', 'WARNING', 'MEDIUM', 'PROCESS'].includes(status)) return 'yellow'
  if (['FAILED', 'ERROR', 'TIMEOUT', 'CRITICAL', 'HIGH', 'ARCHIVED', 'REJECTED', 'N', 'FALSE'].includes(status)) return 'red'
  if (['CUSTOM', 'WEEKLY', 'MONTHLY', 'DAILY'].includes(status)) return 'cyan'
  return 'slate'
}

const defaultModelJson = JSON.stringify({
  nodes: [
    { id: 'start', type: 'START', title: '开始', x: 120, y: 80 },
    { id: 'end', type: 'END', title: '结束', x: 360, y: 80 }
  ],
  edges: [{ id: 'start-end', source: 'start', target: 'end' }]
})

const defaultFieldsJson = JSON.stringify([{ id: 'field1', type: 'TEXT', label: '申请说明', required: true }])

export const workflowPageConfigs: WorkflowPageConfig[] = [
  {
    paths: ['/workflow', '/workflow/design'],
    title: '流程设计',
    eyebrow: 'Workflow Design',
    description: '维护流程定义、表单绑定、版本状态和发布入口',
    icon: GitMerge,
    mode: 'definitions',
    idKey: 'definitionId',
    primaryKey: 'processName',
    searchPlaceholder: '流程名称/流程Key',
    fields: [
      text('processName', '流程名称', { required: true, filter: true }),
      text('processKey', '流程Key', { required: true, filter: true }),
      number('version', '版本', { hiddenInForm: true }),
      text('formId', '表单ID'),
      text('category', '分类', { filter: true }),
      select('status', '状态', processStatusOptions, { defaultValue: 'DRAFT', filter: true, hiddenInForm: true }),
      number('isLatest', '最新版本', { hiddenInForm: true, formatter: (value) => Number(value) === 1 ? '是' : '否' }),
      text('currentVersion', '语义版本', { table: false, placeholder: '例如 v1.0.0' }),
      select('startPermissionType', '发起权限', [{ value: 'ALL', label: '所有人' }, { value: 'ROLE', label: '角色' }, { value: 'DEPT', label: '部门' }, { value: 'USER', label: '用户' }], { defaultValue: 'ALL', table: false, status: false }),
      text('startPermissionValue', '权限值', { table: false, placeholder: 'JSON 或逗号分隔 ID' }),
      text('description', '描述', { type: 'textarea', table: false }),
      text('modelJson', '流程模型 JSON', { type: 'textarea', defaultValue: defaultModelJson, table: false, widthClass: 'md:col-span-2' }),
      dateTime('createTime', '创建时间', { hiddenInForm: true })
    ]
  },
  {
    paths: ['/workflow/management'],
    title: '批量编辑',
    eyebrow: 'Workflow Management',
    description: '集中管理流程定义、批量归档、导入导出与安全检查',
    icon: Settings,
    mode: 'management',
    idKey: 'definitionId',
    primaryKey: 'processName',
    searchPlaceholder: '流程名称/流程Key',
    fields: [
      text('processName', '流程名称', { filter: true }),
      text('processKey', '流程Key', { filter: true }),
      number('version', '版本'),
      text('category', '分类', { filter: true }),
      select('status', '状态', processStatusOptions, { filter: true }),
      number('isLatest', '最新版本', { formatter: (value) => Number(value) === 1 ? '是' : '否' }),
      text('createBy', '创建人'),
      dateTime('createTime', '创建时间')
    ],
    readOnly: true
  },
  {
    paths: ['/forms'],
    title: '表单设计',
    eyebrow: 'Form Design',
    description: '维护流程表单字段、Schema、版本与发布状态',
    icon: FileInput,
    mode: 'forms',
    idKey: 'formId',
    primaryKey: 'formName',
    searchPlaceholder: '表单名称/表单Key',
    fields: [
      text('formName', '表单名称', { required: true, filter: true }),
      text('formKey', '表单Key', { filter: true }),
      number('version', '版本', { hiddenInForm: true }),
      select('status', '状态', processStatusOptions, { defaultValue: 'DRAFT', filter: true }),
      number('isLatest', '最新版本', { hiddenInForm: true, formatter: (value) => Number(value) === 1 ? '是' : '否' }),
      text('fieldsJson', '字段 JSON', { type: 'textarea', defaultValue: defaultFieldsJson, table: false, widthClass: 'md:col-span-2' }),
      text('formSchema', '表单 Schema', { type: 'textarea', table: false, widthClass: 'md:col-span-2' }),
      dateTime('createTime', '创建时间', { hiddenInForm: true })
    ]
  },
  {
    paths: ['/workflow/category'],
    title: '流程分类',
    eyebrow: 'Process Category',
    description: '维护流程分类树、编码、图标、排序和启停状态',
    icon: FolderTree,
    mode: 'category',
    idKey: 'categoryId',
    primaryKey: 'categoryName',
    searchPlaceholder: '分类名称/编码',
    fields: [
      text('categoryName', '分类名称', { required: true, filter: true }),
      text('categoryCode', '分类编码', { required: true, filter: true }),
      number('parentId', '父级ID', { defaultValue: 0 }),
      text('parentName', '父级名称', { hiddenInForm: true }),
      text('icon', '图标'),
      number('sortOrder', '排序', { defaultValue: 0 }),
      select('status', '状态', categoryStatusOptions, { defaultValue: '0', filter: true }),
      text('remark', '备注', { type: 'textarea', table: false })
    ]
  },
  {
    paths: ['/workflow/deploy'],
    title: '发布管理',
    eyebrow: 'Deploy Management',
    description: '配置发布窗口、查看发布审批与当前可发布状态',
    icon: Rocket,
    mode: 'deploy',
    idKey: 'id',
    primaryKey: 'windowName',
    searchPlaceholder: '发布窗口名称',
    fields: [
      text('windowName', '窗口名称', { required: true, filter: true }),
      select('windowType', '窗口类型', deployWindowTypeOptions, { defaultValue: 'DAILY', filter: true }),
      time('startTime', '开始时间', { required: true }),
      time('endTime', '结束时间', { required: true }),
      text('weekDays', '星期', { placeholder: '1,2,3,4,5' }),
      text('monthDays', '日期', { placeholder: '1,15,30' }),
      text('customDates', '自定义日期', { type: 'textarea', table: false, placeholder: 'JSON 日期数组' }),
      select('isEnabled', '启用', booleanOptions, { defaultValue: true, filter: true }),
      text('description', '描述', { type: 'textarea', table: false })
    ]
  },
  {
    paths: ['/workflow/monitor'],
    title: '流程监控',
    eyebrow: 'Workflow Monitor',
    description: '查看流程运行状态、超时异常和执行耗时',
    icon: Monitor,
    mode: 'monitor',
    idKey: 'instanceId',
    primaryKey: 'processDefName',
    searchPlaceholder: '流程Key/流程名称',
    fields: [
      text('processDefName', '流程名称'),
      text('processDefKey', '流程Key', { filter: true }),
      text('businessKey', '业务Key'),
      select('status', '状态', monitorStatusOptions, { filter: true }),
      text('startUserName', '发起人'),
      number('taskCount', '任务数'),
      number('duration', '耗时', { formatter: (value) => formatDuration(value) }),
      dateTime('startTime', '开始时间'),
      dateTime('endTime', '结束时间'),
      text('errorMessage', '异常信息', { table: false })
    ],
    readOnly: true
  },
  {
    paths: ['/workflow/import'],
    title: '流程导入',
    eyebrow: 'Workflow Import',
    description: '导入 JSON 流程包、校验冲突并查看可导出流程',
    icon: Upload,
    mode: 'import',
    idKey: 'definitionId',
    primaryKey: 'processName',
    searchPlaceholder: '流程名称/流程Key',
    fields: [
      text('processName', '流程名称', { filter: true }),
      text('processKey', '流程Key', { filter: true }),
      number('version', '版本'),
      select('status', '状态', processStatusOptions, { filter: true }),
      text('category', '分类'),
      dateTime('createTime', '创建时间')
    ],
    readOnly: true
  },
  {
    paths: ['/workflow/archived'],
    title: '归档管理',
    eyebrow: 'Archive Management',
    description: '查看归档流程、恢复可恢复流程或永久删除归档记录',
    icon: Archive,
    mode: 'archived',
    idKey: 'workflowId',
    primaryKey: 'workflowName',
    searchPlaceholder: '流程名称/流程ID',
    fields: [
      text('workflowName', '流程名称', { filter: true }),
      text('workflowId', '流程ID'),
      text('archivedByName', '归档人'),
      dateTime('archivedAt', '归档时间'),
      select('canRestore', '可恢复', booleanOptions, { hiddenInForm: true }),
      text('archiveReason', '归档原因', { type: 'textarea' }),
      date('archivedAfter', '归档起始', { filter: true, table: false, hiddenInForm: true }),
      date('archivedBefore', '归档截止', { filter: true, table: false, hiddenInForm: true })
    ],
    readOnly: true
  },
  {
    paths: ['/workflow/alerts'],
    title: '告警管理',
    eyebrow: 'Workflow Alerts',
    description: '处理超时提醒、异常告警、升级通知和解决记录',
    icon: Bell,
    mode: 'alerts',
    idKey: 'id',
    primaryKey: 'targetName',
    searchPlaceholder: '目标名称/流程实例',
    fields: [
      text('targetName', '目标名称'),
      text('alertType', '告警类型', { filter: true }),
      select('timeoutLevel', '超时等级', alertLevelOptions, { filter: true }),
      text('assigneeName', '处理人'),
      select('resolved', '解决状态', resolvedOptions, { filter: true }),
      dateTime('alertTime', '告警时间'),
      text('resolveNote', '解决说明', { table: false })
    ],
    readOnly: true
  },
  {
    paths: ['/workflow/performance'],
    title: '性能统计',
    eyebrow: 'Performance Stats',
    description: '查看流程执行吞吐、成功率、耗时和异常趋势',
    icon: BarChart3,
    mode: 'performance',
    idKey: 'id',
    primaryKey: 'processDefName',
    searchPlaceholder: '流程名称/流程Key',
    fields: [
      date('statDate', '统计日期'),
      text('processDefName', '流程名称'),
      text('processDefKey', '流程Key', { filter: true }),
      number('totalCount', '总数'),
      number('completedCount', '完成'),
      number('failedCount', '失败'),
      number('timeoutCount', '超时'),
      number('anomalyCount', '异常'),
      number('avgDuration', '平均耗时', { formatter: (value, row) => formatDuration(value ?? row.avgDurationMs) }),
      number('successRate', '成功率', { formatter: (value) => formatPercent(value) }),
      date('startDate', '起始日期', { filter: true, table: false, hiddenInForm: true }),
      date('endDate', '截止日期', { filter: true, table: false, hiddenInForm: true })
    ],
    readOnly: true
  }
]

export const workflowPageConfigByPath = new Map(
  workflowPageConfigs.flatMap((config) => config.paths.map((path) => [path, config] as const))
)

export const workflowPagePaths = Array.from(workflowPageConfigByPath.keys())

export function formatDuration(value: unknown) {
  const ms = Number(value ?? 0)
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return `${Math.round(ms / 1000)}秒`
  if (minutes < 60) return `${minutes}分钟`
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`
}

export function formatPercent(value: unknown) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '-'
  return `${amount > 1 ? amount.toFixed(1) : (amount * 100).toFixed(1)}%`
}
