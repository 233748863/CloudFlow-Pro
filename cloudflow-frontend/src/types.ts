
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
  email: string;
  role: Role;
  deptId?: string; // Department Link
  tenantId?: number; // Tenant Link
  position?: string;
  status: 'ACTIVE' | 'INACTIVE';
  avatar: string;
}

// --- Dynamic Form Types ---
export type FormFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'TEXTAREA';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: string[]; // For SELECT type
  placeholder?: string;
  // New Validation Fields
  regex?: string;
  errorMsg?: string;
}

export interface FormDefinition {
  id: string;
  name: string;
  fields: FormField[];
}

// --- Org Structure Types ---
export interface Department {
  id: string;
  name: string;
  parentId?: string;
  managerId?: string; // Department Head
  children?: Department[];
}

// --- Workflow Definition Types ---
export enum NodeType {
  START = 'START',
  APPROVAL = 'APPROVAL',
  CONDITION = 'CONDITION', // Exclusive Gateway (XOR)
  PARALLEL = 'PARALLEL',   // Parallel Gateway (AND)
  END = 'END',
  NOTIFICATION = 'NOTIFICATION', // Send notification without approval
  SCRIPT = 'SCRIPT',       // Execute automated script or API call
  TIMER = 'TIMER',         // Delay or scheduled trigger
  SUBPROCESS = 'SUBPROCESS', // Call another workflow
  MANUAL = 'MANUAL',       // Manual task without approval
  // New: Support custom string types for plugins
}

export interface SLAConfig {
  timeoutHours: number;
  action: 'NOTIFY' | 'AUTO_PASS' | 'AUTO_REJECT';
}

export interface RetryConfig {
  maxAttempts: number;
  interval: number; // seconds
}

export interface WorkflowNode {
  // 1. Basic Identity
  id: string;
  type: NodeType | string; // Support custom types (Plugin)
  title: string;
  
  // 2. Structure (Recursive + Linked List)
  next?: WorkflowNode;      // Next node (Serial)
  branches?: WorkflowNode[];// Child branches (Parallel/Exclusive)
  
  // 3. Execution Strategy
  branchStrategy?: 'PARALLEL' | 'RACE' | 'EXCLUSIVE'; 
  condition?: string;       // Entry condition expression

  // 4. Data Flow (I/O)
  inputs?: Record<string, string>;  // { "targetVar": "expression/source" }
  outputs?: Record<string, string>; // { "contextVar": "result" }

  // 5. Resilience & Config
  sla?: SLAConfig;
  retry?: RetryConfig;
  
  // 6. Plugin Properties (Flexible container)
  props?: Record<string, any>; // Stores specific config like api url, approver settings etc.

  // Legacy/Direct props (for backward compatibility or convenience)
  description?: string;
  icon?: string;
  approverType?: 'ROLE' | 'USER' | 'DEPT_MANAGER' | 'DIRECT_LEADER';
  approverValue?: string;
  allowEdit?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  key: string;
  version: number;
  formId?: string; // Bind to a dynamic form
  nodes: WorkflowNode;
}

// --- Instance Types ---
export enum TaskStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED', // New Status
  MODIFIED = 'MODIFIED',
  DELEGATED = 'DELEGATED',
  TIMED_OUT = 'TIMED_OUT'
}

export interface Task {
  id: string;
  processInstanceId: string;
  workflowId: string; // Link back to definition
  workflowName: string;
  nodeName: string;
  
  applicantId: string; // Who started it
  applicantName: string;
  
  assigneeId?: string; // Specific user assignee
  assigneeName?: string; // Display name for assignee
  assigneeRole?: Role; // Role-based assignee
  
  type: 'LEAVE' | 'REIMBURSEMENT' | 'DYNAMIC'; // Support dynamic forms
  
  // Dynamic Data Container
  formId?: string; // Link to the form definition
  formData?: Record<string, any>; 
  
  // Legacy fields for backward compatibility (optional)
  amount?: number;
  days?: number;
  reason: string;
  
  status: TaskStatus;
  createdTime: string;
  dueDate?: string; // Deadline for the task
  allowEdit: boolean;
  logs?: TaskLog[];
  approvedAmount?: number;
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
  ownerId?: string;
  priority: WorkTaskPriority;
  status: WorkTaskStatus;
  dueDate?: string;
  tags?: string; // JSON array string
  parentId?: string;
  createBy?: string;
  createTime?: string;
}

// Unified Task Interface for UI
export interface UnifiedTask {
  id: string;
  title: string;
  type: 'PROCESS' | 'WORK';
  status: string; // TaskStatus | WorkTaskStatus
  statusLabel: string;
  priority: number; // 0-2
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
  createdTime?: string;
  sourceData: Task | WorkTask; // Keep original data
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
  content: string; // HTML
  type: AnnouncementType;
  scopeType: AnnouncementScope;
  scopeValue?: string;
  status: '0' | '1' | '2'; // Draft, Published, Revoked
  priority: 'L' | 'M' | 'H';
  senderId: number;
  createTime: string;
  publishTime?: string;
  expireTime?: string;
  isTop: number; // 0 or 1
  isRead: boolean; // Computed field
}

// --- Schedule & Meeting Types ---
export interface MeetingRoom {
  roomId: string;
  name: string;
  capacity: number;
  location: string;
  equipment: string; // JSON String
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
  attendees?: string; // JSON String of IDs
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
  records?: T[]; // For compatibility if backend uses records
}

export interface R<T = any> {
  code: number;
  msg: string;
  data: T;
}
