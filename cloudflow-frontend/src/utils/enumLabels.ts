/**
 * 集中收口「后端英文枚举 -> 前端中文 label」一类映射。
 *
 * 与 src/utils/mappers.ts 分工：mappers.ts 处理表单字段/业务对象之间的结构转换，
 * 本文件专门承载离散枚举到展示文案的映射，所有跨模块复用的英文枚举字典都收口在此。
 *
 * 任意 getXxxLabel 未命中映射时 fallback 到原 key（与后端 getOrDefault 同语义），
 * 保证未来新增枚举不会渲染空白。
 */

const labelOf = (map: Record<string, string | { label?: string }>, key?: string | null): string => {
  if (!key) return '-';
  const entry = map[key];
  if (entry == null) return key;
  return typeof entry === 'string' ? entry : (entry.label ?? key);
};

// 工作流异常类型（wf_reconcile_alert.anomaly_type）
// 与后端 WorkflowMonitorServiceImpl.ANOMALY_TYPE_LABELS 一一对齐
export const ANOMALY_TYPE_LABELS: Record<string, string> = {
  EXECUTION_FAILED: '执行失败',
  NO_ASSIGNEE: '无人认领',
  DEADLOCK: '死锁',
  DATA_INCONSISTENCY: '数据不一致',
  BUSINESS_EXCEPTION: '业务异常',
  CALLBACK_FAILED: '回调失败',
  NODE_TIMEOUT: '节点超时',
  APPROVER_UNAVAILABLE: '审批人不可用',
  APPROVER_INVALID: '审批人无效',
  APPROVAL_NODE_TIMEOUT: '审批节点超时',
};

export const getAnomalyTypeLabel = (type?: string | null): string =>
  labelOf(ANOMALY_TYPE_LABELS, type);

// 严重度 / 风险等级（与后端 TIMEOUT_LEVEL_LABELS + CRM riskLevel 等共用一套维度）
export const SEVERITY_LABELS: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '严重',
  REMIND: '提醒',
  WARNING: '警告',
};

export const getSeverityLabel = (level?: string | null): string =>
  labelOf(SEVERITY_LABELS, level);

// 预算/指标阈值状态
export const THRESHOLD_STATUS_LABELS: Record<string, string> = {
  NORMAL: '正常',
  WARNING: '预警',
  CRITICAL: '紧急',
};

export const getThresholdStatusLabel = (status?: string | null): string =>
  labelOf(THRESHOLD_STATUS_LABELS, status);

// 招聘渠道启停状态
export const RECRUIT_CHANNEL_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  DISABLED: '已停用',
};

export const getRecruitChannelStatusLabel = (status?: string | null): string =>
  labelOf(RECRUIT_CHANNEL_STATUS_LABELS, status);

// 培训报名/参训记录状态
export const TRAINING_ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  REGISTERED: '已报名',
  PENDING: '待开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  ABSENT: '缺席',
  PASSED: '已通过',
  FAILED: '未通过',
};

export const getTrainingEnrollmentStatusLabel = (status?: string | null): string =>
  labelOf(TRAINING_ENROLLMENT_STATUS_LABELS, status);

// 试卷状态
export const EXAM_PAPER_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  DISABLED: '已停用',
};

export const getExamPaperStatusLabel = (status?: string | null): string =>
  labelOf(EXAM_PAPER_STATUS_LABELS, status);

// 待办项状态（首页 dashboard 联动待办面板使用）
export const TODO_STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  IN_PROGRESS: '处理中',
  DONE: '已完成',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  OVERDUE: '已逾期',
  REJECTED: '已驳回',
};

export const getTodoStatusLabel = (status?: string | null): string =>
  labelOf(TODO_STATUS_LABELS, status);

// CRM 通用启停状态（CrmProductPage / CrmPriceBookPage / CrmAssignmentRulePage / CrmSalesTargetPage 共用）
export const CRM_GENERIC_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  DISABLED: '已停用',
  ARCHIVED: '已归档',
};

export const getCrmGenericStatusLabel = (status?: string | null): string =>
  labelOf(CRM_GENERIC_STATUS_LABELS, status);

// CRM 线索状态
export const CRM_LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: '新线索',
  FOLLOWING: '跟进中',
  QUALIFIED: '已确认',
  CONVERTED: '已转客户',
  CLOSED: '已关闭',
  DISQUALIFIED: '已淘汰',
  LOST: '已失败',
};

export const getCrmLeadStatusLabel = (status?: string | null): string =>
  labelOf(CRM_LEAD_STATUS_LABELS, status);

// 状态 + 颜色调色板（HR 等多页面共用）
// tone 输出 Tailwind class string，可直接用于 <span className={meta.tone}>
// colorName 输出简化色名（emerald / amber 等），用于 HR 的 statusPill(label, colorName) 组件签名
export type StatusColorName = 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' | 'violet' | 'orange' | 'teal';

export interface StatusMeta {
  label: string;
  /** 浅色简化 class（无 dark mode），现有调用方兼容 */
  tone: string;
  /** 完整 Tailwind class：light + dark mode + ring/border，下游页面直接 `<span className={meta.fullClass}>` */
  fullClass?: string;
  colorName?: StatusColorName;
}

const STATUS_META_FALLBACK: StatusMeta = {
  label: '-',
  tone: 'bg-slate-50 text-slate-600',
};

const buildStatusMeta = (
  map: Record<string, StatusMeta>,
  key?: string | null,
): StatusMeta => {
  if (!key) return STATUS_META_FALLBACK;
  return map[key] ?? { label: key, tone: STATUS_META_FALLBACK.tone };
};

// HR 员工状态（HrDashboardPage / HrEmployeePage / HrEmployeeWorkspace 等共用）
// fullClass 采用 HR 历史 border 风格，兼容现有视觉
export const EMPLOYEE_STATUS_META: Record<string, StatusMeta> = {
  ACTIVE: {
    label: '在职',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
  // 兼容旧状态码 REGULAR（与 ACTIVE 同义）
  REGULAR: {
    label: '在职',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
  PROBATION: {
    label: '试用',
    tone: 'bg-sky-50 text-sky-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  ON_LEAVE: {
    label: '休假',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  SUSPENDED: {
    label: '停职',
    tone: 'bg-orange-50 text-orange-700',
    fullClass: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
    colorName: 'orange',
  },
  TRANSFERRED: {
    label: '调岗',
    tone: 'bg-violet-50 text-violet-700',
    fullClass: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
    colorName: 'violet',
  },
  RESIGNED: {
    label: '离职',
    tone: 'bg-slate-100 text-slate-600',
    fullClass: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    colorName: 'slate',
  },
  TERMINATED: {
    label: '解雇',
    tone: 'bg-rose-50 text-rose-700',
    fullClass: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    colorName: 'rose',
  },
};

/** HR 员工类型（FULL_TIME/PART_TIME/INTERN/CONTRACTOR） */
export const EMPLOYEE_TYPE_META: Record<string, StatusMeta> = {
  FULL_TIME: {
    label: '全职',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
  PART_TIME: {
    label: '兼职',
    tone: 'bg-violet-50 text-violet-700',
    fullClass: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
    colorName: 'violet',
  },
  INTERN: {
    label: '实习',
    tone: 'bg-sky-50 text-sky-700',
    fullClass: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    colorName: 'sky',
  },
  CONTRACTOR: {
    label: '外包',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
};

export const getEmployeeTypeMeta = (type?: string | null): StatusMeta =>
  buildStatusMeta(EMPLOYEE_TYPE_META, type);

/** HR statusPill 组件签名所需 — 返回简化色名（emerald/amber/...） */
export const getEmployeeStatusColor = (status?: string | null): StatusColorName =>
  EMPLOYEE_STATUS_META[status ?? ''] ? (EMPLOYEE_STATUS_META[status as string].colorName ?? 'slate') : 'slate';

export const getEmployeeStatusMeta = (status?: string | null): StatusMeta =>
  buildStatusMeta(EMPLOYEE_STATUS_META, status);

// 通用申请单状态（请假、报销等）
export const REQUEST_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: {
    label: '草稿',
    tone: 'bg-slate-50 text-slate-600',
    fullClass: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    colorName: 'slate',
  },
  PENDING: {
    label: '审批中',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  APPROVING: {
    label: '审批中',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  APPROVED: {
    label: '已通过',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
  REJECTED: {
    label: '已驳回',
    tone: 'bg-rose-50 text-rose-700',
    fullClass: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    colorName: 'rose',
  },
  CANCELLED: {
    label: '已撤销',
    tone: 'bg-slate-100 text-slate-500',
    fullClass: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
    colorName: 'slate',
  },
  COMPLETED: {
    label: '已完成',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'slate',
  },
  RECRUITING: {
    label: '招聘中',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
};

export const getRequestStatusColor = (status?: string | null): StatusColorName =>
  REQUEST_STATUS_META[status ?? ''] ? (REQUEST_STATUS_META[status as string].colorName ?? 'teal') : 'teal';

export const getRequestStatusMeta = (status?: string | null): StatusMeta =>
  buildStatusMeta(REQUEST_STATUS_META, status);

// 合同状态
export const CONTRACT_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: {
    label: '草稿',
    tone: 'bg-slate-50 text-slate-600',
    fullClass: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    colorName: 'slate',
  },
  PENDING: {
    label: '待审批',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  APPROVED: {
    label: '已批准',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
  ACTIVE: {
    label: '执行中',
    tone: 'bg-sky-50 text-sky-700',
    fullClass: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    colorName: 'sky',
  },
  EXPIRING: {
    label: '即将到期',
    tone: 'bg-orange-50 text-orange-700',
    fullClass: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
    colorName: 'orange',
  },
  EXPIRED: {
    label: '已到期',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  TERMINATED: {
    label: '已终止',
    tone: 'bg-slate-100 text-slate-600',
    fullClass: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    colorName: 'rose',
  },
  ARCHIVED: {
    label: '已归档',
    tone: 'bg-violet-50 text-violet-700',
    fullClass: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
    colorName: 'violet',
  },
};

export const getContractStatusColor = (status?: string | null): StatusColorName =>
  CONTRACT_STATUS_META[status ?? ''] ? (CONTRACT_STATUS_META[status as string].colorName ?? 'slate') : 'slate';

export const getContractStatusMeta = (status?: string | null): StatusMeta =>
  buildStatusMeta(CONTRACT_STATUS_META, status);

// 公告状态（兼容数字 code 0/1/2 + 语义码 DRAFT/PUBLISHED/REVOKED）
// fullClass 采用 ring 风格（与原 announcementMeta.tsx 视觉一致）
const ANNOUNCEMENT_STATUS_DRAFT: StatusMeta = {
  label: '草稿',
  tone: 'bg-slate-100 text-slate-600',
  fullClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
};
const ANNOUNCEMENT_STATUS_PUBLISHED: StatusMeta = {
  label: '已发布',
  tone: 'bg-emerald-50 text-emerald-600',
  fullClass: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900/60',
};
const ANNOUNCEMENT_STATUS_REVOKED: StatusMeta = {
  label: '已撤销',
  tone: 'bg-rose-50 text-rose-600',
  fullClass: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:ring-rose-900/60',
};
export const ANNOUNCEMENT_STATUS_META: Record<string, StatusMeta> = {
  '0': ANNOUNCEMENT_STATUS_DRAFT,
  '1': ANNOUNCEMENT_STATUS_PUBLISHED,
  '2': ANNOUNCEMENT_STATUS_REVOKED,
  DRAFT: ANNOUNCEMENT_STATUS_DRAFT,
  PUBLISHED: ANNOUNCEMENT_STATUS_PUBLISHED,
  REVOKED: ANNOUNCEMENT_STATUS_REVOKED,
  EXPIRED: ANNOUNCEMENT_STATUS_REVOKED,
};

export const getAnnouncementStatusMeta = (status?: string | number | null): StatusMeta =>
  buildStatusMeta(ANNOUNCEMENT_STATUS_META, status == null ? null : String(status));

// 公告类型（type 不带 icon——icon 由 announcementMeta.tsx 单独维护，避免 React 依赖污染 utils）
const ANNOUNCEMENT_TYPE_ENTRY: StatusMeta = {
  label: '公告',
  tone: 'bg-sky-50 text-sky-600',
  fullClass: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-950/30 dark:text-sky-200 dark:ring-sky-900/60',
};
const URGENT_TYPE_ENTRY: StatusMeta = {
  label: '紧急',
  tone: 'bg-rose-50 text-rose-600',
  fullClass: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:ring-rose-900/60',
};
const NOTIFICATION_TYPE_ENTRY: StatusMeta = {
  label: '通知',
  tone: 'bg-cyan-50 text-cyan-600',
  fullClass: 'bg-cyan-50 text-cyan-600 ring-1 ring-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-200 dark:ring-cyan-900/60',
};
export const ANNOUNCEMENT_TYPE_META: Record<string, StatusMeta> = {
  ANNOUNCEMENT: ANNOUNCEMENT_TYPE_ENTRY,
  URGENT: URGENT_TYPE_ENTRY,
  NOTIFICATION: NOTIFICATION_TYPE_ENTRY,
  // 兼容 AnnouncementType 枚举数字字符串值（NOTIFICATION='1', ANNOUNCEMENT='2', URGENT='3'）
  '1': NOTIFICATION_TYPE_ENTRY,
  '2': ANNOUNCEMENT_TYPE_ENTRY,
  '3': URGENT_TYPE_ENTRY,
};

export const getAnnouncementTypeMeta = (type?: string | null): StatusMeta =>
  buildStatusMeta(ANNOUNCEMENT_TYPE_META, type);

// 公告优先级（H 高 / 默认中 / L 低）
const ANNOUNCEMENT_PRIORITY_DEFAULT: StatusMeta = {
  label: '中优先级',
  tone: 'bg-amber-50 text-amber-600',
  fullClass: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/60',
};
export const ANNOUNCEMENT_PRIORITY_META: Record<string, StatusMeta> = {
  H: {
    label: '高优先级',
    tone: 'bg-rose-50 text-rose-600',
    fullClass: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:ring-rose-900/60',
  },
  M: ANNOUNCEMENT_PRIORITY_DEFAULT,
  L: {
    label: '低优先级',
    tone: 'bg-slate-100 text-slate-500',
    fullClass: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  },
};

export const getAnnouncementPriorityMeta = (priority?: string | null): StatusMeta => {
  if (!priority) return ANNOUNCEMENT_PRIORITY_DEFAULT;
  return ANNOUNCEMENT_PRIORITY_META[priority] ?? ANNOUNCEMENT_PRIORITY_DEFAULT;
};

// 工作流流程实例状态（运行时）
export const WORKFLOW_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', tone: 'bg-slate-50 text-slate-600' },
  RUNNING: { label: '审批中', tone: 'bg-sky-50 text-sky-700' },
  PAUSED: { label: '已暂停', tone: 'bg-amber-50 text-amber-700' },
  COMPLETED: { label: '已完成', tone: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: '已驳回', tone: 'bg-rose-50 text-rose-700' },
  CANCELLED: { label: '已撤销', tone: 'bg-slate-100 text-slate-500' },
  TERMINATED: { label: '已终止', tone: 'bg-rose-50 text-rose-700' },
};

export const getWorkflowStatusMeta = (status?: string | null): StatusMeta =>
  buildStatusMeta(WORKFLOW_STATUS_META, status);

// 工作流定义状态（设计态，与实例运行态分开）— ProcessManagement.tsx 使用
export const WORKFLOW_DEFINITION_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: { label: '草稿', tone: 'bg-slate-50 text-slate-600' },
  PUBLISHED: { label: '已发布', tone: 'bg-emerald-50 text-emerald-700' },
  ARCHIVED: { label: '已归档', tone: 'bg-slate-100 text-slate-500' },
};

export const getWorkflowDefinitionStatusMeta = (status?: string | null): StatusMeta => {
  if (!status) return WORKFLOW_DEFINITION_STATUS_META.DRAFT;
  return WORKFLOW_DEFINITION_STATUS_META[status] ?? WORKFLOW_DEFINITION_STATUS_META.DRAFT;
};

// 发票状态（InvoiceManagementPage / CrmCustomerWorkspacePage 共用）
// 与后端 OaInvoice.status 枚举一一对齐
export const INVOICE_STATUS_META: Record<string, StatusMeta> = {
  NONE: {
    label: '未关联合同发票',
    tone: 'bg-slate-50 text-slate-500',
    fullClass: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    colorName: 'slate',
  },
  REGISTERED: {
    label: '已登记',
    tone: 'bg-slate-50 text-slate-600',
    fullClass: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    colorName: 'slate',
  },
  BOUND: {
    label: '已绑定',
    tone: 'bg-sky-50 text-sky-700',
    fullClass: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    colorName: 'sky',
  },
  WRITEOFF_PARTIAL: {
    label: '部分核销',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  WRITEOFF_FULL: {
    label: '全部核销',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
  VOID: {
    label: '已作废',
    tone: 'bg-rose-50 text-rose-700',
    fullClass: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    colorName: 'rose',
  },
};

export const getInvoiceStatusMeta = (status?: string | null): StatusMeta =>
  buildStatusMeta(INVOICE_STATUS_META, status);

export const getInvoiceStatusLabel = (status?: string | null): string =>
  labelOf(INVOICE_STATUS_META, status);

// 发票方向（InvoiceManagementPage 使用）
export const INVOICE_DIRECTION_META: Record<string, StatusMeta> = {
  INPUT: {
    label: '进项发票',
    tone: 'bg-sky-50 text-sky-700',
  },
  OUTPUT: {
    label: '销项发票',
    tone: 'bg-amber-50 text-amber-700',
  },
};

export const getInvoiceDirectionLabel = (dir?: string | null): string =>
  labelOf(INVOICE_DIRECTION_META, dir);

// 薪资单状态（HrEssSalarySlipPage 使用）
export const SALARY_SLIP_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: {
    label: '草稿',
    tone: 'bg-slate-50 text-slate-600',
    fullClass: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    colorName: 'slate',
  },
  CONFIRMED: {
    label: '已确认',
    tone: 'bg-sky-50 text-sky-700',
    fullClass: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    colorName: 'sky',
  },
  PAID: {
    label: '已发放',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
  RELEASED: {
    label: '已下发',
    tone: 'bg-violet-50 text-violet-700',
    fullClass: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
    colorName: 'violet',
  },
};

export const getSalarySlipStatusLabel = (status?: string | null): string =>
  labelOf(SALARY_SLIP_STATUS_META, status);

// 证明申请状态（HrEssCertificatePage 使用）
// 注意 CANCELLED = '已取消'（非 REQUEST_STATUS_META 的 '已撤销'），语义不同故独立建 META
export const CERTIFICATE_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: {
    label: '草稿',
    tone: 'bg-slate-50 text-slate-600',
    fullClass: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    colorName: 'slate',
  },
  PENDING: {
    label: '待审批',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  APPROVING: {
    label: '审批中',
    tone: 'bg-amber-50 text-amber-700',
    fullClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    colorName: 'amber',
  },
  APPROVED: {
    label: '已通过',
    tone: 'bg-emerald-50 text-emerald-700',
    fullClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    colorName: 'emerald',
  },
  REJECTED: {
    label: '已驳回',
    tone: 'bg-rose-50 text-rose-700',
    fullClass: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    colorName: 'rose',
  },
  ISSUED: {
    label: '已开具',
    tone: 'bg-sky-50 text-sky-700',
    fullClass: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    colorName: 'sky',
  },
  CANCELLED: {
    label: '已取消',
    tone: 'bg-slate-100 text-slate-500',
    fullClass: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
    colorName: 'slate',
  },
};

export const getCertificateStatusLabel = (status?: string | null): string =>
  labelOf(CERTIFICATE_STATUS_META, status);
