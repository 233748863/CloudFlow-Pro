import request from './request';

/** 操作日志实体 */
export interface SysLog {
  logId: number;
  tenantId?: number;
  logType: string;       // 0=正常, 9=错误
  title: string;         // 操作描述
  serviceId?: string;    // 服务名称
  remoteAddr?: string;   // 客户端IP
  userAgent?: string;    // 浏览器UA
  requestUri?: string;   // 请求URI
  method?: string;       // HTTP方法
  params?: string;       // 请求参数
  time?: number;         // 执行时间(ms)
  exception?: string;    // 异常信息
  createBy?: string;     // 操作人
  createTime?: string;   // 创建时间
}

/** 审计日志实体 */
export interface SysAuditLog {
  auditId: number;
  tenantId?: number;
  auditName: string;     // 审计业务名称
  auditField: string;    // 变更字段名
  beforeVal?: string;    // 变更前值
  afterVal?: string;     // 变更后值
  createBy?: string;     // 操作人
  createTime?: string;   // 创建时间
}

/** 分页结果 */
export interface PageResult<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

/** 趋势数据项 */
export interface LogTrendItem {
  date: string;
  success: number;
  fail: number;
}

/** 操作日志查询参数 */
export interface SysLogQuery {
  pageNum?: number;
  pageSize?: number;
  logType?: string;
  title?: string;
  createBy?: string;
  startTime?: string;
  endTime?: string;
}

/** 审计日志查询参数 */
export interface AuditLogQuery {
  pageNum?: number;
  pageSize?: number;
  auditName?: string;
  auditField?: string;
  createBy?: string;
  startTime?: string;
  endTime?: string;
}

/** ???????? */
export interface LoginLogQuery {
  pageNum?: number;
  pageSize?: number;
  logType?: string;
  createBy?: string;
  remoteAddr?: string;
  startTime?: string;
  endTime?: string;
}

// ==================== 操作日志 API ====================

// 日志/审计接口统一走 auth 服务，网关路由: /auth/** → cloudflow-auth (StripPrefix=1)
// 后端 Controller 路径: /system/log/... 和 /system/audit-log/...

/** 分页查询操作日志 */
export const getSysLogPage = (params: SysLogQuery): Promise<PageResult<SysLog>> => {
  return request.get<PageResult<SysLog>>('/auth/system/log/page', { params });
};

/** 获取操作日志详情 */
export const getSysLogDetail = (id: number): Promise<SysLog> => {
  return request.get<SysLog>(`/auth/system/log/${id}`);
};

/** 删除操作日志（批量） */
export const deleteSysLogs = (ids: number[]): Promise<string> => {
  return request.delete<string>('/auth/system/log', { data: ids });
};

/** 获取操作日志趋势（最近30天） */
export const getSysLogTrend = (): Promise<LogTrendItem[]> => {
  return request.get<LogTrendItem[]>('/auth/system/log/trend');
};

// ==================== 审计日志 API ====================

/** 分页查询审计日志 */
export const getAuditLogPage = (params: AuditLogQuery): Promise<PageResult<SysAuditLog>> => {
  return request.get<PageResult<SysAuditLog>>('/auth/system/audit-log/page', { params });
};

/** 获取审计日志详情 */
export const getAuditLogDetail = (id: number): Promise<SysAuditLog> => {
  return request.get<SysAuditLog>(`/auth/system/audit-log/${id}`);
};

/** 删除审计日志（批量） */
export const deleteAuditLogs = (ids: number[]): Promise<string> => {
  return request.delete<string>('/auth/system/audit-log', { data: ids });
};


// ==================== ???? API ====================

/** ???????? */
export const getLoginLogPage = (params: LoginLogQuery): Promise<PageResult<SysLog>> => {
  return request.get<PageResult<SysLog>>('/auth/system/login-log/page', { params });
};

/** ???????? */
export const getLoginLogDetail = (id: number): Promise<SysLog> => {
  return request.get<SysLog>(`/auth/system/login-log/${id}`);
};

/** ?????????? */
export const deleteLoginLogs = (ids: number[]): Promise<string> => {
  return request.delete<string>('/auth/system/login-log', { data: ids });
};

/** ???????????30?? */
export const getLoginLogTrend = (): Promise<LogTrendItem[]> => {
  return request.get<LogTrendItem[]>('/auth/system/login-log/trend');
};
