/**
 * 集中收口「后端英文枚举 -> 前端中文 label」一类映射（仅保留 P2 范围）。
 *
 * 与 src/utils/mappers.ts 分工：mappers.ts 处理表单字段/业务对象之间的结构转换，
 * 本文件专门承载离散枚举到展示文案的映射。
 *
 * 字典系统集成进度：P0 / P1 范围共 13 个枚举已迁移到后端字典系统，
 * 业务页面通过 useDict / DictBadge / DictSelect 直接读取。
 * 已迁移：
 *   employee_status, employee_type, request_status, contract_status,
 *   invoice_status, salary_slip_status, crm_lead_status,
 *   severity_level, announcement_status, announcement_type,
 *   announcement_priority, workflow_status, workflow_definition_status
 *
 * 本文件仅保留 P2 — 「不迁移到字典」的枚举：
 *   - 与工作流引擎/算法强耦合
 *   - 技术性枚举或固定流程
 *   - 不需要运营动态配置
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

// 系统文件类型（sys_file.file_type）
// 历史数据可能保存 MIME，新上传数据保存扩展名；展示与筛选统一归一到分类枚举。
export const SYSTEM_FILE_TYPE_CATEGORY = {
  IMAGE: 'FILE_CATEGORY_IMAGE',
  PDF: 'FILE_CATEGORY_PDF',
  WORD: 'FILE_CATEGORY_WORD',
  EXCEL: 'FILE_CATEGORY_EXCEL',
  PPT: 'FILE_CATEGORY_PPT',
  TEXT: 'FILE_CATEGORY_TEXT',
  ARCHIVE: 'FILE_CATEGORY_ARCHIVE',
  VIDEO: 'FILE_CATEGORY_VIDEO',
  AUDIO: 'FILE_CATEGORY_AUDIO',
  OTHER: 'FILE_CATEGORY_OTHER',
} as const;

export type SystemFileTypeCategory =
  (typeof SYSTEM_FILE_TYPE_CATEGORY)[keyof typeof SYSTEM_FILE_TYPE_CATEGORY];

export const SYSTEM_FILE_TYPE_LABELS: Record<SystemFileTypeCategory, string> = {
  [SYSTEM_FILE_TYPE_CATEGORY.IMAGE]: '图片',
  [SYSTEM_FILE_TYPE_CATEGORY.PDF]: 'PDF',
  [SYSTEM_FILE_TYPE_CATEGORY.WORD]: 'Word',
  [SYSTEM_FILE_TYPE_CATEGORY.EXCEL]: 'Excel',
  [SYSTEM_FILE_TYPE_CATEGORY.PPT]: 'PPT',
  [SYSTEM_FILE_TYPE_CATEGORY.TEXT]: '文本',
  [SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE]: '压缩包',
  [SYSTEM_FILE_TYPE_CATEGORY.VIDEO]: '视频',
  [SYSTEM_FILE_TYPE_CATEGORY.AUDIO]: '音频',
  [SYSTEM_FILE_TYPE_CATEGORY.OTHER]: '文件',
};

export const SYSTEM_FILE_TYPE_FILTER_OPTIONS = [
  SYSTEM_FILE_TYPE_CATEGORY.IMAGE,
  SYSTEM_FILE_TYPE_CATEGORY.PDF,
  SYSTEM_FILE_TYPE_CATEGORY.WORD,
  SYSTEM_FILE_TYPE_CATEGORY.EXCEL,
  SYSTEM_FILE_TYPE_CATEGORY.PPT,
  SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  SYSTEM_FILE_TYPE_CATEGORY.VIDEO,
  SYSTEM_FILE_TYPE_CATEGORY.AUDIO,
].map((value) => ({ value, label: SYSTEM_FILE_TYPE_LABELS[value] }));

const SYSTEM_FILE_TYPE_EXTENSION_CATEGORY: Record<string, SystemFileTypeCategory> = {
  jpg: SYSTEM_FILE_TYPE_CATEGORY.IMAGE,
  jpeg: SYSTEM_FILE_TYPE_CATEGORY.IMAGE,
  png: SYSTEM_FILE_TYPE_CATEGORY.IMAGE,
  gif: SYSTEM_FILE_TYPE_CATEGORY.IMAGE,
  bmp: SYSTEM_FILE_TYPE_CATEGORY.IMAGE,
  webp: SYSTEM_FILE_TYPE_CATEGORY.IMAGE,
  svg: SYSTEM_FILE_TYPE_CATEGORY.IMAGE,
  pdf: SYSTEM_FILE_TYPE_CATEGORY.PDF,
  doc: SYSTEM_FILE_TYPE_CATEGORY.WORD,
  docx: SYSTEM_FILE_TYPE_CATEGORY.WORD,
  xls: SYSTEM_FILE_TYPE_CATEGORY.EXCEL,
  xlsx: SYSTEM_FILE_TYPE_CATEGORY.EXCEL,
  csv: SYSTEM_FILE_TYPE_CATEGORY.EXCEL,
  ppt: SYSTEM_FILE_TYPE_CATEGORY.PPT,
  pptx: SYSTEM_FILE_TYPE_CATEGORY.PPT,
  txt: SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  md: SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  html: SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  htm: SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  json: SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  xml: SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  zip: SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  rar: SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  '7z': SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  tar: SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  gz: SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  bz2: SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  mp4: SYSTEM_FILE_TYPE_CATEGORY.VIDEO,
  avi: SYSTEM_FILE_TYPE_CATEGORY.VIDEO,
  rmvb: SYSTEM_FILE_TYPE_CATEGORY.VIDEO,
  mov: SYSTEM_FILE_TYPE_CATEGORY.VIDEO,
  webm: SYSTEM_FILE_TYPE_CATEGORY.VIDEO,
  mp3: SYSTEM_FILE_TYPE_CATEGORY.AUDIO,
  wav: SYSTEM_FILE_TYPE_CATEGORY.AUDIO,
  aac: SYSTEM_FILE_TYPE_CATEGORY.AUDIO,
  flac: SYSTEM_FILE_TYPE_CATEGORY.AUDIO,
};

const SYSTEM_FILE_TYPE_MIME_CATEGORY: Record<string, SystemFileTypeCategory> = {
  'application/pdf': SYSTEM_FILE_TYPE_CATEGORY.PDF,
  'application/msword': SYSTEM_FILE_TYPE_CATEGORY.WORD,
  'application/doc': SYSTEM_FILE_TYPE_CATEGORY.WORD,
  'application/docx': SYSTEM_FILE_TYPE_CATEGORY.WORD,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    SYSTEM_FILE_TYPE_CATEGORY.WORD,
  'application/vnd.ms-excel': SYSTEM_FILE_TYPE_CATEGORY.EXCEL,
  'application/xls': SYSTEM_FILE_TYPE_CATEGORY.EXCEL,
  'application/xlsx': SYSTEM_FILE_TYPE_CATEGORY.EXCEL,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    SYSTEM_FILE_TYPE_CATEGORY.EXCEL,
  'application/vnd.ms-powerpoint': SYSTEM_FILE_TYPE_CATEGORY.PPT,
  'application/ppt': SYSTEM_FILE_TYPE_CATEGORY.PPT,
  'application/pptx': SYSTEM_FILE_TYPE_CATEGORY.PPT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    SYSTEM_FILE_TYPE_CATEGORY.PPT,
  'application/json': SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  'application/xml': SYSTEM_FILE_TYPE_CATEGORY.TEXT,
  'application/zip': SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  'application/x-zip-compressed': SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  'application/x-rar-compressed': SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  'application/x-7z-compressed': SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  'application/gzip': SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  'application/x-tar': SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
  'application/x-bzip2': SYSTEM_FILE_TYPE_CATEGORY.ARCHIVE,
};

export const getSystemFileTypeCategory = (type?: string | null): SystemFileTypeCategory => {
  const normalizedType = type?.trim().toLowerCase().replace(/^\./, '').split(';')[0] ?? '';
  if (!normalizedType) return SYSTEM_FILE_TYPE_CATEGORY.OTHER;
  if (normalizedType.startsWith('image/')) return SYSTEM_FILE_TYPE_CATEGORY.IMAGE;
  if (normalizedType.startsWith('text/')) return SYSTEM_FILE_TYPE_CATEGORY.TEXT;
  if (normalizedType.startsWith('video/')) return SYSTEM_FILE_TYPE_CATEGORY.VIDEO;
  if (normalizedType.startsWith('audio/')) return SYSTEM_FILE_TYPE_CATEGORY.AUDIO;
  return (
    SYSTEM_FILE_TYPE_MIME_CATEGORY[normalizedType] ??
    SYSTEM_FILE_TYPE_EXTENSION_CATEGORY[normalizedType] ??
    SYSTEM_FILE_TYPE_CATEGORY.OTHER
  );
};

export const getSystemFileTypeLabel = (type?: string | null): string =>
  SYSTEM_FILE_TYPE_LABELS[getSystemFileTypeCategory(type)];

// 状态 + 颜色调色板（仅保留类型与构造器，供 P2 枚举的 META 继续使用）
export type StatusColorName = 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' | 'violet' | 'orange' | 'teal';

export interface StatusMeta {
  label: string;
  /** 浅色简化 class（无 dark mode），现有调用方兼容 */
  tone: string;
  /** 完整 Tailwind class：light + dark mode + ring/border */
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

// 发票方向（InvoiceManagementPage 使用，保留为前端枚举：进项/销项固定不变）
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

// 证明申请状态（HrEssCertificatePage 使用，保留为前端枚举）
// 注意 CANCELLED = '已取消'（非 REQUEST_STATUS 的 '已撤销'），语义不同故独立维护
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

// 为兼容个别构造器引用而保留（虽然当前未导出 META 中使用，但 buildStatusMeta 已私有）
void buildStatusMeta;
