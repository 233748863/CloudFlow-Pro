export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  HR = 'HR',
  FINANCE = 'FINANCE',
  EMPLOYEE = 'EMPLOYEE',
  USER = 'USER'
}

export interface User {
  id: string
  name: string
  username?: string
  email: string
  role: Role | string
  deptId?: string
  deptName?: string
  tenantId?: number
  tenantName?: string
  position?: string
  phone?: string
  status?: string
  createTime?: string
  avatar?: string
  permissions?: string[]
  forcePasswordChange?: boolean
}

export interface PageResult<T> {
  total: number
  rows: T[]
  records?: T[]
}

export interface ApiResponse<T = unknown> {
  code: number
  msg?: string
  message?: string
  data: T
}

export enum NodeType {
  START = 'START',
  APPROVAL = 'APPROVAL',
  CONDITION = 'CONDITION',
  PARALLEL = 'PARALLEL',
  END = 'END',
  NOTIFICATION = 'NOTIFICATION',
  SCRIPT = 'SCRIPT',
  TIMER = 'TIMER',
  SUBPROCESS = 'SUBPROCESS',
  MANUAL = 'MANUAL',
  COPY = 'COPY'
}

export interface WorkflowGraphNode {
  id: string
  type: string
  title?: string
  condition?: string
  branchStrategy?: 'PARALLEL' | 'RACE' | 'EXCLUSIVE'
  approverType?: 'ROLE' | 'USER' | 'USERS' | 'INITIATOR' | 'DEPT_MANAGER' | 'DIRECT_LEADER' | 'DEPT'
  approverValue?: string
  signType?: 'ALL' | 'ANY' | 'PERCENT' | 'SEQUENTIAL'
  passPercent?: number
  description?: string
  slaHours?: number
  slaAction?: 'AUTO_PASS' | 'AUTO_REJECT'
  retry?: {
    maxRetries: number
    delayMs: number
  }
  props?: Record<string, unknown>
  [key: string]: unknown
}

export interface WorkflowGraphEdge {
  id?: string
  source: string
  target: string
  condition?: string
  isDefault?: boolean | number | string
  [key: string]: unknown
}

export interface WorkflowGraphDefinition {
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
}

export interface WorkflowDefinition {
  id: string
  name: string
  key: string
  version: number
  formId?: string
  graph: WorkflowGraphDefinition
  description?: string
  category?: string
  tags?: string
  startPermissionType?: string
  startPermissionValue?: string
  deptId?: number
}

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
  announcementId: number
  title: string
  content: string
  type: AnnouncementType | string
  scopeType: AnnouncementScope | string
  scopeValue?: string
  status: '0' | '1' | '2' | string
  priority: 'L' | 'M' | 'H' | string
  senderId?: number
  createTime: string
  publishTime?: string
  expireTime?: string
  isTop?: number
  isRead?: boolean
}
