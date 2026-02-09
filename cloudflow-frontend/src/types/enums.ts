/**
 * 枚举常量定义
 * 统一管理所有枚举类型，替代字符串常量
 */

// ============================================================
// 任务相关枚举
// ============================================================

/** 任务状态 */
export enum TaskStatus {
  /** 待处理 */
  PENDING = 'PENDING',
  /** 已通过 */
  APPROVED = 'APPROVED',
  /** 已拒绝 */
  REJECTED = 'REJECTED',
  /** 已超时 */
  TIMED_OUT = 'TIMED_OUT',
  /** 已退回 */
  RETURNED = 'RETURNED',
  /** 已修改 */
  MODIFIED = 'MODIFIED',
  /** 已转办 */
  DELEGATED = 'DELEGATED',
}

/** 任务优先级 */
export enum TaskPriority {
  /** 低 */
  LOW = 'LOW',
  /** 中 */
  MEDIUM = 'MEDIUM',
  /** 高 */
  HIGH = 'HIGH',
  /** 紧急 */
  URGENT = 'URGENT',
}

/** 任务类型 */
export enum TaskType {
  /** 流程任务 */
  PROCESS = 'PROCESS',
  /** 工作任务 */
  WORK = 'WORK',
  /** 请假 */
  LEAVE = 'LEAVE',
  /** 报销 */
  REIMBURSEMENT = 'REIMBURSEMENT',
  /** 动态表单 */
  DYNAMIC = 'DYNAMIC',
}

// ============================================================
// 流程相关枚举
// ============================================================

/** 流程实例状态 */
export enum ProcessInstanceStatus {
  /** 运行中 */
  RUNNING = 'RUNNING',
  /** 已完成 */
  COMPLETED = 'COMPLETED',
  /** 已挂起 */
  SUSPENDED = 'SUSPENDED',
  /** 已终止 */
  TERMINATED = 'TERMINATED',
}

/** 流程定义状态 */
export enum ProcessDefinitionStatus {
  /** 草稿 */
  DRAFT = 'DRAFT',
  /** 激活 */
  ACTIVE = 'ACTIVE',
  /** 挂起 */
  SUSPENDED = 'SUSPENDED',
  /** 已归档 */
  ARCHIVED = 'ARCHIVED',
}

/** 节点类型 */
export enum NodeType {
  /** 开始节点 */
  START = 'START',
  /** 审批节点 */
  APPROVAL = 'APPROVAL',
  /** 通知节点 */
  NOTIFY = 'NOTIFY',
  /** 结束节点 */
  END = 'END',
  /** 网关节点 */
  GATEWAY = 'GATEWAY',
  /** 条件节点 */
  CONDITION = 'CONDITION',
  /** 并行节点 */
  PARALLEL = 'PARALLEL',
  /** 子流程节点 */
  SUBPROCESS = 'SUBPROCESS',
}

/** 审批人类型 */
export enum AssigneeType {
  /** 指定用户 */
  USER = 'USER',
  /** 指定角色 */
  ROLE = 'ROLE',
  /** 部门经理 */
  DEPT_MANAGER = 'DEPT_MANAGER',
  /** 直属领导 */
  DIRECT_LEADER = 'DIRECT_LEADER',
  /** 发起人自己 */
  SELF = 'SELF',
}

/** 分支策略 */
export enum BranchStrategy {
  /** 排他网关（单选） */
  EXCLUSIVE = 'EXCLUSIVE',
  /** 并行网关（全部） */
  PARALLEL = 'PARALLEL',
  /** 竞争网关（最快） */
  RACE = 'RACE',
}

// ============================================================
// 表单相关枚举
// ============================================================

/** 表单字段类型 */
export enum FieldType {
  /** 单行文本 */
  TEXT = 'TEXT',
  /** 多行文本 */
  TEXTAREA = 'TEXTAREA',
  /** 数字 */
  NUMBER = 'NUMBER',
  /** 日期 */
  DATE = 'DATE',
  /** 日期时间 */
  DATETIME = 'DATETIME',
  /** 下拉选择 */
  SELECT = 'SELECT',
  /** 单选框 */
  RADIO = 'RADIO',
  /** 复选框 */
  CHECKBOX = 'CHECKBOX',
  /** 文件上传 */
  FILE = 'FILE',
  /** 图片上传 */
  IMAGE = 'IMAGE',
}

// ============================================================
// 用户相关枚举
// ============================================================

/** 用户角色 */
export enum Role {
  /** 管理员 */
  ADMIN = 'ADMIN',
  /** 经理 */
  MANAGER = 'MANAGER',
  /** 员工 */
  EMPLOYEE = 'EMPLOYEE',
  /** 访客 */
  GUEST = 'GUEST',
}

/** 用户状态 */
export enum UserStatus {
  /** 激活 */
  ACTIVE = 'ACTIVE',
  /** 禁用 */
  DISABLED = 'DISABLED',
  /** 锁定 */
  LOCKED = 'LOCKED',
  /** 待激活 */
  PENDING = 'PENDING',
}

// ============================================================
// 工作任务相关枚举
// ============================================================

/** 工作任务状态 */
export enum WorkTaskStatus {
  /** 待办 */
  TODO = 'TODO',
  /** 进行中 */
  DOING = 'DOING',
  /** 已完成 */
  DONE = 'DONE',
  /** 已取消 */
  CANCELLED = 'CANCELLED',
}

// ============================================================
// 通知相关枚举
// ============================================================

/** 通知类型 */
export enum NotificationType {
  /** 系统通知 */
  SYSTEM = 'SYSTEM',
  /** 任务通知 */
  TASK = 'TASK',
  /** 流程通知 */
  PROCESS = 'PROCESS',
  /** 公告通知 */
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

/** 通知优先级 */
export enum NotificationPriority {
  /** 低 */
  LOW = 'LOW',
  /** 中 */
  MEDIUM = 'MEDIUM',
  /** 高 */
  HIGH = 'HIGH',
}

// ============================================================
// 日志相关枚举
// ============================================================

/** 日志级别 */
export enum LogLevel {
  /** 调试 */
  DEBUG = 'DEBUG',
  /** 信息 */
  INFO = 'INFO',
  /** 警告 */
  WARN = 'WARN',
  /** 错误 */
  ERROR = 'ERROR',
}

/** 操作类型 */
export enum OperationType {
  /** 创建 */
  CREATE = 'CREATE',
  /** 更新 */
  UPDATE = 'UPDATE',
  /** 删除 */
  DELETE = 'DELETE',
  /** 查询 */
  READ = 'READ',
  /** 审批 */
  APPROVE = 'APPROVE',
  /** 拒绝 */
  REJECT = 'REJECT',
  /** 转办 */
  DELEGATE = 'DELEGATE',
  /** 催办 */
  URGE = 'URGE',
}

// ============================================================
// 视图模式枚举
// ============================================================

/** 任务视图模式 */
export enum TaskViewMode {
  /** 列表视图 */
  LIST = 'LIST',
  /** 看板视图 */
  BOARD = 'BOARD',
  /** 日历视图 */
  CALENDAR = 'CALENDAR',
}

/** 筛选类型 */
export enum FilterType {
  /** 全部 */
  ALL = 'ALL',
  /** 流程任务 */
  PROCESS = 'PROCESS',
  /** 工作任务 */
  WORK = 'WORK',
}

// ============================================================
// 枚举辅助函数
// ============================================================

/** 获取任务状态标签 */
export function getTaskStatusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    [TaskStatus.PENDING]: '待处理',
    [TaskStatus.APPROVED]: '已通过',
    [TaskStatus.REJECTED]: '已拒绝',
    [TaskStatus.TIMED_OUT]: '已超时',
    [TaskStatus.RETURNED]: '已退回',
    [TaskStatus.MODIFIED]: '已修改',
    [TaskStatus.DELEGATED]: '已转办',
  };
  return labels[status] || status;
}

/** 获取任务状态颜色 */
export function getTaskStatusColor(status: TaskStatus): string {
  const colors: Record<TaskStatus, string> = {
    [TaskStatus.PENDING]: 'blue',
    [TaskStatus.APPROVED]: 'green',
    [TaskStatus.REJECTED]: 'red',
    [TaskStatus.TIMED_OUT]: 'orange',
    [TaskStatus.RETURNED]: 'yellow',
    [TaskStatus.MODIFIED]: 'cyan',
    [TaskStatus.DELEGATED]: 'purple',
  };
  return colors[status] || 'gray';
}

/** 获取任务优先级标签 */
export function getTaskPriorityLabel(priority: TaskPriority): string {
  const labels: Record<TaskPriority, string> = {
    [TaskPriority.LOW]: '低',
    [TaskPriority.MEDIUM]: '中',
    [TaskPriority.HIGH]: '高',
    [TaskPriority.URGENT]: '紧急',
  };
  return labels[priority] || priority;
}

/** 获取节点类型标签 */
export function getNodeTypeLabel(type: NodeType): string {
  const labels: Record<NodeType, string> = {
    [NodeType.START]: '开始',
    [NodeType.APPROVAL]: '审批',
    [NodeType.NOTIFY]: '通知',
    [NodeType.END]: '结束',
    [NodeType.GATEWAY]: '网关',
    [NodeType.CONDITION]: '条件',
    [NodeType.PARALLEL]: '并行',
    [NodeType.SUBPROCESS]: '子流程',
  };
  return labels[type] || type;
}

/** 获取字段类型标签 */
export function getFieldTypeLabel(type: FieldType): string {
  const labels: Record<FieldType, string> = {
    [FieldType.TEXT]: '单行文本',
    [FieldType.TEXTAREA]: '多行文本',
    [FieldType.NUMBER]: '数字',
    [FieldType.DATE]: '日期',
    [FieldType.DATETIME]: '日期时间',
    [FieldType.SELECT]: '下拉选择',
    [FieldType.RADIO]: '单选框',
    [FieldType.CHECKBOX]: '复选框',
    [FieldType.FILE]: '文件上传',
    [FieldType.IMAGE]: '图片上传',
  };
  return labels[type] || type;
}
