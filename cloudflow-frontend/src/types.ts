export enum Role {
  ADMIN = 'ADMIN',
  HR = 'HR',
  EMPLOYEE = 'EMPLOYEE',
}

export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: Role;
  deptId?: string;
  deptName?: string;
  tenantId?: number;
  tenantName?: string;
  position?: string;
  phone?: string;
  status?: string;
  createTime?: string;
  avatar?: string;
  permissions?: string[];
}

export interface Department {
  id: string;
  name: string;
  parentId?: string;
  managerId?: string;
  children?: Department[];
}

export enum AnnouncementType {
  NOTIFICATION = '1',
  ANNOUNCEMENT = '2',
  URGENT = '3',
}

export enum AnnouncementScope {
  ALL = 'ALL',
  DEPT = 'DEPT',
  ROLE = 'ROLE',
}

export interface Announcement {
  announcementId: number;
  title: string;
  content: string;
  type: AnnouncementType;
  scopeType: AnnouncementScope;
  scopeValue?: string;
  status: '0' | '1' | '2';
  priority: 'L' | 'M' | 'H';
  senderId: number;
  createTime: string;
  publishTime?: string;
  expireTime?: string;
  isTop: number;
  isRead: boolean;
}

export interface SysScheduleEvent {
  eventId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  type: 'MEETING' | 'PERSONAL' | 'WORK';
  creatorId: string;
  attendees?: string;
}

export interface PageQuery {
  pageNum: number;
  pageSize: number;
  [key: string]: unknown;
}

export interface PageResult<T> {
  total: number;
  rows: T[];
  records?: T[];
}
