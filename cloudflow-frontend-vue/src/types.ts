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
