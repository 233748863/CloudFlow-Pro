import request from '@/services/api/request'

export interface SysLog {
  logId: number
  tenantId?: number
  logType: string
  title?: string
  serviceId?: string
  remoteAddr?: string
  userAgent?: string
  requestUri?: string
  method?: string
  params?: string
  time?: number
  exception?: string
  createBy?: string
  createTime?: string
}

export interface SysAuditLog {
  auditId: number
  tenantId?: number
  auditName: string
  auditField: string
  beforeVal?: string
  afterVal?: string
  createBy?: string
  createTime?: string
}

export interface LogPageResult<T> {
  records?: T[]
  rows?: T[]
  total?: number
  size?: number
  current?: number
  pages?: number
}

export interface LogTrendItem {
  date: string
  success: number
  fail: number
}

export interface SysLogQuery {
  pageNum?: number
  pageSize?: number
  logType?: string
  title?: string
  createBy?: string
  remoteAddr?: string
  startTime?: string
  endTime?: string
}

export interface AuditLogQuery {
  pageNum?: number
  pageSize?: number
  auditName?: string
  auditField?: string
  createBy?: string
  startTime?: string
  endTime?: string
}

export const getSysLogPage = (params: SysLogQuery) =>
  request.get<LogPageResult<SysLog>>('/auth/system/log/page', { params })

export const getSysLogDetail = (id: number) =>
  request.get<SysLog>(`/auth/system/log/${id}`)

export const deleteSysLogs = (ids: number[]) =>
  request.delete<string>('/auth/system/log', { data: ids })

export const getSysLogTrend = () =>
  request.get<LogTrendItem[]>('/auth/system/log/trend')

export const getLoginLogPage = (params: SysLogQuery) =>
  request.get<LogPageResult<SysLog>>('/auth/system/login-log/page', { params })

export const getLoginLogDetail = (id: number) =>
  request.get<SysLog>(`/auth/system/login-log/${id}`)

export const deleteLoginLogs = (ids: number[]) =>
  request.delete<string>('/auth/system/login-log', { data: ids })

export const getLoginLogTrend = () =>
  request.get<LogTrendItem[]>('/auth/system/login-log/trend')

export const getAuditLogPage = (params: AuditLogQuery) =>
  request.get<LogPageResult<SysAuditLog>>('/auth/system/audit-log/page', { params })

export const getAuditLogDetail = (id: number) =>
  request.get<SysAuditLog>(`/auth/system/audit-log/${id}`)

export const deleteAuditLogs = (ids: number[]) =>
  request.delete<string>('/auth/system/audit-log', { data: ids })
