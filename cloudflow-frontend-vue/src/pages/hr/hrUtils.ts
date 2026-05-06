import type { DeptTreeNode, HrPagedResult } from '@/services/api/hr'

export const normalizeRows = <T>(data: unknown): T[] => {
  if (!data) return []
  if (Array.isArray(data)) return data as T[]
  const record = data as HrPagedResult<T>
  if (Array.isArray(record.records)) return record.records
  if (Array.isArray(record.rows)) return record.rows
  return []
}

export const getTotal = <T>(data: HrPagedResult<T> | T[] | null | undefined, fallback = 0) => {
  if (!data) return fallback
  if (Array.isArray(data)) return data.length
  return Number(data.total ?? data.records?.length ?? data.rows?.length ?? fallback)
}

export const toDateInputValue = (value?: string | null) => {
  if (!value) return ''
  return String(value).slice(0, 10)
}

export const todayValue = () => new Date().toISOString().slice(0, 10)

export const formatDate = (value?: string | null, fallback = '-') =>
  toDateInputValue(value) || fallback

export const formatCurrency = (value?: number | string | null) => {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '-'
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2
  }).format(amount)
}

export const formatNumber = (value?: number | string | null) => {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '0'
  return new Intl.NumberFormat('zh-CN').format(amount)
}

export const buildEmployeeLabel = (employee?: { employeeNo?: string; name?: string } | null) => {
  if (!employee) return '-'
  return [employee.name, employee.employeeNo].filter(Boolean).join(' / ') || '-'
}

export const flattenDeptTree = (nodes: DeptTreeNode[] = []): DeptTreeNode[] =>
  nodes.flatMap((node) => [node, ...flattenDeptTree(node.children || [])])

export const parseAttachmentText = (value?: string | string[] | null) => {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean)
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export const joinAttachmentText = (value?: string[] | null) =>
  (value || []).map((item) => item.trim()).filter(Boolean).join('\n')

export type StatusTone = 'slate' | 'green' | 'red' | 'yellow' | 'cyan'

export const statusTone = (status?: string | number | null): StatusTone => {
  const value = String(status ?? '').toUpperCase()
  if (['ACTIVE', 'REGULAR', 'APPROVED', 'COMPLETED', 'NORMAL', 'PASSED', 'ACCEPTED', 'SENT', 'EFFECTIVE', '1'].includes(value)) return 'green'
  if (['DRAFT', 'PENDING', 'PROBATION', 'APPROVING', 'SUBMITTED', 'INTERVIEW', 'SCREENING', 'SCHEDULED', 'IN_PROGRESS', 'RECRUITING'].includes(value)) return 'yellow'
  if (['REJECTED', 'RESIGNED', 'TERMINATED', 'EXPIRED', 'CANCELLED', 'FAILED', '0'].includes(value)) return 'red'
  return 'slate'
}

export const employeeStatusLabel: Record<string, string> = {
  PENDING: '待入职',
  PROBATION: '试用期',
  REGULAR: '正式员工',
  RESIGNED: '已离职'
}

export const employeeTypeLabel: Record<string, string> = {
  FULL_TIME: '全职',
  PART_TIME: '兼职',
  INTERN: '实习生',
  CONTRACTOR: '外包'
}

export const contractTypeLabel: Record<string, string> = {
  LABOR: '劳动合同',
  SERVICE: '劳务合同',
  INTERN: '实习协议'
}

export const contractStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '生效中',
  EXPIRED: '已过期',
  TERMINATED: '已终止'
}

export const documentTypeLabel: Record<string, string> = {
  ID_CARD: '身份证',
  PASSPORT: '护照',
  DIPLOMA: '学历证书',
  DEGREE: '学位证书'
}

export const relationshipLabel: Record<string, string> = {
  SPOUSE: '配偶',
  PARENT: '父母',
  SIBLING: '兄弟姐妹',
  CHILD: '子女',
  OTHER: '其他'
}

export const salaryCategoryLabel: Record<string, string> = {
  BASIC: '基本工资',
  ALLOWANCE: '津贴',
  BONUS: '奖金',
  DEDUCTION: '扣款',
  INSURANCE: '社保',
  TAX: '个税'
}

export const salaryItemTypeLabel: Record<string, string> = {
  FIXED: '固定项',
  VARIABLE: '浮动项'
}

export const adjustmentTypeLabel: Record<string, string> = {
  PROMOTION: '晋升调薪',
  ANNUAL: '年度调薪',
  PERFORMANCE: '绩效调薪',
  MARKET: '市场调薪'
}

export const deductionTypeLabel: Record<string, string> = {
  CHILD_EDU: '子女教育',
  CONTINUING_EDU: '继续教育',
  MEDICAL: '大病医疗',
  HOUSING_LOAN: '住房贷款利息',
  HOUSING_RENT: '住房租金',
  ELDERLY_CARE: '赡养老人'
}

export const workflowStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待处理',
  SUBMITTED: '已提交',
  APPROVING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
  COMPLETED: '已完成',
  ACTIVE: '进行中',
  RECRUITING: '招聘中',
  SCREENING: '筛选中',
  INTERVIEW: '面试中',
  SCHEDULED: '已安排',
  PASSED: '已通过',
  FAILED: '未通过',
  OFFERED: '已发 Offer',
  SENT: '已发送',
  ACCEPTED: '已接受',
  ONBOARDING: '入职中',
  CONFIRMED: '已确认',
  EFFECTIVE: '已生效'
}

export const candidateSourceLabel: Record<string, string> = {
  WEBSITE: '招聘网站',
  REFERRAL: '内推',
  CAMPUS: '校园招聘',
  HEADHUNTER: '猎头',
  OTHER: '其他'
}

export const transferTypeLabel: Record<string, string> = {
  DEPT: '部门调动',
  POST: '岗位调动',
  POSITION: '职位调整',
  PROMOTION: '晋升',
  DEMOTION: '降级'
}

export const resignationTypeLabel: Record<string, string> = {
  VOLUNTARY: '主动离职',
  TERMINATION: '解除劳动关系',
  RETIREMENT: '退休',
  CONTRACT_END: '合同到期',
  OTHER: '其他'
}
