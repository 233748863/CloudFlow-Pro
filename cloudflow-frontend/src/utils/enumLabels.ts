/**
 * 集中收口「后端英文枚举 -> 前端中文 label」一类映射。
 *
 * 与 src/utils/mappers.ts 分工：mappers.ts 处理表单字段/业务对象之间的结构转换，
 * 本文件专门承载离散枚举到展示文案的映射，所有跨模块复用的英文枚举字典都收口在此。
 *
 * 任意 getXxxLabel 未命中映射时 fallback 到原 key（与后端 getOrDefault 同语义），
 * 保证未来新增枚举不会渲染空白。
 */

const labelOf = (map: Record<string, string>, key?: string | null): string => {
  if (!key) return '-';
  return map[key] ?? key;
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
