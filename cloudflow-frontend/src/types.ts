
export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  HR = 'HR',
  FINANCE = 'FINANCE',
  EMPLOYEE = 'EMPLOYEE'
}

export interface User {
  id: string;
  name: string;
  username?: string; // 登录账号名
  email: string;
  role: Role;
  deptId?: string;
  deptName?: string; // 部门名称（由后端填充）
  tenantId?: number;
  position?: string;
  phone?: string; // 手机号
  status?: string;
  avatar?: string;
}

// --- 动态表单类型 ---
export type FormFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'TEXTAREA';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: string[]; // 用于 SELECT 类型
  placeholder?: string;
  // 新增验证字段
  regex?: string;
  errorMsg?: string;
}

export interface FormDefinition {
  id: string;
  name: string;
  fields: FormField[];
}

// --- 组织架构类型 ---
export interface Department {
  id: string;
  name: string;
  parentId?: string;
  managerId?: string; // 部门负责人
  children?: Department[];
}

// --- 工作流定义类型 ---
export enum NodeType {
  START = 'START',
  APPROVAL = 'APPROVAL',
  CONDITION = 'CONDITION', // 排他网关 (XOR)
  PARALLEL = 'PARALLEL',   // 并行网关 (AND)
  END = 'END',
  NOTIFICATION = 'NOTIFICATION', // 发送通知（无需审批）
  SCRIPT = 'SCRIPT',       // 执行自动化脚本或 API 调用
  TIMER = 'TIMER',         // 延时或定时触发
  SUBPROCESS = 'SUBPROCESS', // 调用子流程
  MANUAL = 'MANUAL',       // 手动任务（无需审批）
  COPY = 'COPY',           // 抄送节点 - 发送副本给指定用户
  // 新增：支持自定义字符串类型（插件扩展）
}

export interface RetryConfig {
  maxAttempts: number;
  interval: number; // 秒
}

export interface WorkflowNode {
  // 1. Basic Identity
  id: string;
  type: NodeType | string; // 支持自定义类型（插件）
  title: string;
  
  // 2. Structure (Recursive + Linked List)
  next?: WorkflowNode;      // 下一个节点（串行）
  branches?: WorkflowNode[];// 子分支（并行/排他）
  
  // 3. Execution Strategy
  branchStrategy?: 'PARALLEL' | 'RACE' | 'EXCLUSIVE'; 
  condition?: string;       // 入口条件表达式

  // 4. Data Flow (I/O)
  inputs?: Record<string, string>;  // { "targetVar": "expression/source" }
  outputs?: Record<string, string>; // { "contextVar": "result" }

  // 5. Resilience & Config
  // P1-7: SLA 字段改为平铺，与后端 WfNodeConfig.slaHours/slaAction 对齐
  slaHours?: number;        // SLA 超时小时数
  slaAction?: 'AUTO_PASS' | 'AUTO_REJECT'; // SLA 超时动作
  retry?: RetryConfig;
  
  // 6. Plugin Properties (Flexible container)
  props?: Record<string, any>; // 存储特定配置，如 API URL、审批人设置等

  // 会签配置（顶层字段，与后端 WfNodeConfig 对齐）
  /** 会签类型，仅 PARALLEL 节点 */
  signType?: 'ALL' | 'ANY' | 'PERCENT' | 'SEQUENTIAL';
  /** 会签通过百分比，仅 PERCENT 类型 */
  passPercent?: number;

  // 兼容性/直接属性（向后兼容或便捷访问）
  description?: string;
  icon?: string;
  approverType?: 'ROLE' | 'USER' | 'USERS' | 'DEPT_MANAGER' | 'DIRECT_LEADER' | 'DEPT';
  approverValue?: string;
  allowEdit?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  key: string;
  version: number;
  formId?: string; // 绑定动态表单
  nodes: WorkflowNode;
}

// --- Instance Types ---
export enum TaskStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED', // 新增状态
  MODIFIED = 'MODIFIED',
  DELEGATED = 'DELEGATED',
  TIMED_OUT = 'TIMED_OUT'
}

export interface Task {
  id: string;
  processInstanceId: string;
  workflowId: string; // 关联流程定义
  workflowName: string;
  nodeName: string;
  
  applicantId: string; // 发起人
  applicantName: string;
  
  assigneeId?: string; // 指定处理人ID
  assigneeName?: string; // 处理人显示名称
  assigneeRole?: Role; // 角色类型处理人
  
  type: 'LEAVE' | 'REIMBURSEMENT' | 'DYNAMIC'; // 支持动态表单
  
  // 动态数据容器
  formId?: string; // 关联表单定义
  formData?: Record<string, any>; 
  
  // 兼容性字段（可选，向后兼容）
  amount?: number;
  days?: number;
  reason: string;
  
  status: TaskStatus;
  backendStatus?: string; // 后端原始状态（RUNNING/COMPLETED/REJECTED/REVOKED），用于"我的申请"筛选
  createdTime: string;
  dueDate?: string; // 任务截止时间
  allowEdit: boolean;
  logs?: TaskLog[];
  approvedAmount?: number;

  // 流程步骤进度信息（后端填充的非持久化字段）
  /** 当前步骤序号（从1开始） */
  currentStepIndex?: number;
  /** 总步骤数 */
  totalSteps?: number;
  /** 上一步节点名称 */
  previousNodeName?: string;
  /** 上一步处理人姓名 */
  previousOperatorName?: string;
  /** 下一步节点名称 */
  nextNodeName?: string;
  /** 下一步处理人描述 */
  nextAssigneeName?: string;
  /** 当前节点名称（用于流程实例） */
  currentNodeName?: string;
  /** 流程步骤详情列表（后端 buildStepDetail 构建） */
  stepsDetail?: StepDetail[];

  /** P0-7: 节点级按钮权限列表，由后端从流程定义 props.buttons 中提取
   * 可选值: APPROVE(同意), REJECT(拒绝), RETURN(驳回), DELEGATE(转办), ADD_SIGN(加签)
   * 为 null/undefined 时显示所有默认按钮（向后兼容） */
  buttonPermissions?: string[];
}

/**
 * 流程步骤审批人详情（对应后端 buildStepDetail 返回的 Map）
 * 支持普通审批节点、会签节点、并行网关节点、条件网关节点
 */
export interface StepDetail {
  /** 节点Key */
  nodeKey: string;
  /** 节点标题 */
  nodeTitle: string;
  /** 步骤序号（从0开始，0为"发起申请"） */
  stepIndex: number;
  /** 节点类型 (START/APPROVAL/MANUAL/PARALLEL/CONDITION) */
  nodeType?: string;
  /** 审批人分配类型 (USER/ROLE/DEPT_MANAGER/DIRECT_LEADER/INITIATOR) */
  approverType: string;
  /** 分配类型中文标签 (指定人员/按角色/部门经理/直属领导/发起人) */
  approverTypeLabel: string;
  /** 审批人描述 (如"张三"、"财务主管"、"部门经理") */
  approverDescription: string;
  /** 具体审批人列表 */
  approverUsers: { userId: number; userName: string }[];
  /** 步骤状态: completed / active / pending */
  status: 'completed' | 'active' | 'pending';
  /** 实际处理人姓名（已完成的步骤才有） */
  operatorName?: string;
  /** 会签类型 (ALL-全部同意 / ANY-任一同意 / PERCENT-按比例 / SEQUENTIAL-顺序签署)，仅会签节点 */
  signType?: 'ALL' | 'ANY' | 'PERCENT' | 'SEQUENTIAL';
  /** 会签通过百分比，仅 PERCENT 类型 */
  passPercent?: number;
  /** 分支策略 (PARALLEL/EXCLUSIVE)，仅网关节点 */
  branchStrategy?: 'PARALLEL' | 'EXCLUSIVE';
  /** 分支步骤详情列表，仅网关节点。每个元素是一个分支的步骤数组 */
  branches?: StepDetail[][];
}

export interface TaskLog {
  operator: string;
  action: '同意' | '拒绝' | '修改金额' | '转办' | '退回' | '撤回转办' | '自动超时处理' | '发起';
  comment?: string;
  time: string;
}

// --- Work Task (Collaboration) Types ---
export enum WorkTaskPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2
}

export enum WorkTaskStatus {
  TODO = 'TODO',
  DOING = 'DOING',
  DONE = 'DONE'
}

export interface WorkTask {
  taskId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  /** 处理人用户名（由后端填充） */
  assigneeName?: string;
  ownerId?: string;
  priority: WorkTaskPriority;
  status: WorkTaskStatus;
  dueDate?: string;
  tags?: string; // JSON 数组字符串
  parentId?: string;
  createBy?: string;
  createTime?: string;
}

// 统一任务接口（UI层使用）
export interface UnifiedTask {
  id: string;
  title: string;
  type: 'PROCESS' | 'WORK';
  status: string; // 任务状态（TaskStatus | WorkTaskStatus）
  statusLabel: string;
  priority: number; // 0-2
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
  createdTime?: string;
  sourceData: Task | WorkTask; // 保留原始数据
}

// --- Announcement Types ---
export enum AnnouncementType {
  NOTIFICATION = '1',
  ANNOUNCEMENT = '2',
  URGENT = '3'
}

export enum AnnouncementScope {
  ALL = 'ALL',
  DEPT = 'DEPT',
  ROLE = 'ROLE'
}

export interface Announcement {
  announcementId: number;
  title: string;
  content: string; // HTML内容
  type: AnnouncementType;
  scopeType: AnnouncementScope;
  scopeValue?: string;
  status: '0' | '1' | '2'; // 0=草稿, 1=已发布, 2=已撤回
  priority: 'L' | 'M' | 'H';
  senderId: number;
  createTime: string;
  publishTime?: string;
  expireTime?: string;
  isTop: number; // 0 or 1
  isRead: boolean; // 计算字段
}

// --- Schedule & Meeting Types ---
export interface MeetingRoom {
  roomId: string;
  name: string;
  capacity: number;
  location: string;
  equipment: string; // JSON 字符串
  status: '1' | '0';
}

export interface SysScheduleEvent {
  eventId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  type: 'MEETING' | 'PERSONAL' | 'WORK';
  roomId?: string;
  creatorId: string;
  attendees?: string; // JSON 字符串格式的用户ID列表
}

// --- Common API Types ---
export interface PageQuery {
  pageNum: number;
  pageSize: number;
  [key: string]: any;
}

export interface PageResult<T> {
  total: number;
  rows: T[];
  records?: T[]; // 兼容后端使用 records 字段的情况
}

export interface R<T = any> {
  code: number;
  msg: string;
  data: T;
}
