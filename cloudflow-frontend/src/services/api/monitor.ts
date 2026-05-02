/**
 * 工作流监控告警 API 服务层
 * Phase 2 新增功能
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */

import request from './request';

// ==================== 类型定义 ====================

/**
 * 流程监控记录
 */
export interface ProcessMonitor {
  id: number;
  instanceId: string;
  processDefKey: string;
  processName: string;
  status: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  nodeCount: number;
  taskCount: number;
  errorMessage?: string;
}

/**
 * 超时告警记录
 */
export interface TimeoutAlert {
  id: number;
  tenantId: number;
  alertType: 'TASK' | 'PROCESS';
  targetId: string;
  targetName: string;
  timeoutLevel: 'REMIND' | 'WARNING' | 'CRITICAL';
  timeoutDuration: number;
  threshold?: number;
  assigneeId?: number;
  assigneeName?: string;
  notificationSent: 'Y' | 'N';
  escalated: 'Y' | 'N';
  escalatedToId?: number;
  escalatedToName?: string;
  escalatedTime?: string;
  resolved?: 'Y' | 'N';
  resolvedById?: number;
  resolvedByName?: string;
  resolveNote?: string;
  alertTime: string;
  resolveTime?: string;
  createTime: string;
  updateTime?: string;
}

export interface TimeoutAlertHandleResult {
  alertId: number;
  action: string;
  escalatedToId?: number;
  escalatedToName?: string;
  escalatedTime?: string;
  message?: string;
}

/**
 * 异常告警记录
 */
export interface AnomalyAlert {
  id: number;
  instanceId: string;
  processDefKey: string;
  processName: string;
  anomalyType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  errorMessage?: string;
  stackTrace?: string;
  description?: string;
  errorDetails?: string;
  resolved: 'Y' | 'N';
  resolveNote?: string;
  alertTime?: string;
  createTime: string;
  resolveTime?: string;
  notificationSent?: 'Y' | 'N';
}

/**
 * 性能统计数据
 */
export interface PerformanceStats {
  id: number;
  statDate: string;
  processDefKey: string;
  processName: string;
  totalCount: number;
  completedCount: number;
  avgDurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
  successRate: number;
  timeoutRate: number;
  anomalyRate: number;
}

/**
 * 监控概览数据
 */
export interface MonitorOverview {
  // 今日统计
  todayStarted: number;
  todayCompleted: number;
  todayTimeout: number;
  todayAnomaly: number;
  
  // 当前状态
  runningCount: number;
  pendingTaskCount: number;
  
  // 告警统计
  warningAlertCount: number;
  criticalAlertCount: number;
  unresolvedAnomalyCount: number;
  
  // 性能指标
  avgCompletionTimeMs: number;
  successRate: number;
}

/**
 * 流程趋势数据
 */
export interface ProcessTrend {
  date: string;
  started: number;
  completed: number;
  timeout: number;
  anomaly: number;
  running?: number;
}

// ==================== 流程监控 API ====================

/**
 * 获取流程监控列表
 */
export async function getProcessMonitors(params?: {
  pageNum?: number;
  pageSize?: number;
  processDefKey?: string;
  status?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
}): Promise<any> {
  return request.get('/workflow/monitor/process/list', { params });
}

/**
 * 获取流程监控详情
 */
export async function getProcessMonitor(instanceId: string): Promise<ProcessMonitor> {
  return request.get(`/workflow/monitor/process/${instanceId}`);
}

// ==================== 超时告警 API ====================

/**
 * 获取超时告警列表
 */
export async function getTimeoutAlerts(params?: {
  pageNum?: number;
  pageSize?: number;
  alertType?: 'TASK' | 'PROCESS';
  alertLevel?: 'REMIND' | 'WARNING' | 'CRITICAL';
  resolved?: boolean;
}): Promise<any> {
  return request.get('/workflow/monitor/timeout/list', { params });
}

/**
 * 处理超时告警
 */
export async function handleTimeoutAlert(
  alertId: number,
  action: string,
): Promise<TimeoutAlertHandleResult> {
  return request.post(`/workflow/monitor/timeout/${alertId}/handle`, { action });
}

/**
 * 获取我的超时告警升级待办
 */
export async function getTimeoutEscalationTasks(params?: {
  pageNum?: number;
  pageSize?: number;
}): Promise<any> {
  return request.get('/workflow/monitor/timeout/escalation-tasks', { params });
}

/**
 * 解决超时告警
 */
export async function resolveTimeoutAlert(alertId: number, resolveNote: string): Promise<TimeoutAlert> {
  return request.post(`/workflow/monitor/timeout/${alertId}/resolve`, { resolveNote });
}

// ==================== 异常告警 API ====================

/**
 * 获取异常告警列表
 */
export async function getAnomalyAlerts(params?: {
  pageNum?: number;
  pageSize?: number;
  anomalyType?: string;
  severity?: string;
  resolved?: boolean;
}): Promise<any> {
  return request.get('/workflow/monitor/anomaly/list', { params });
}

/**
 * 解决异常告警
 */
export async function resolveAnomalyAlert(
  alertId: number, 
  resolveNote: string
): Promise<void> {
  return request.post(`/workflow/monitor/anomaly/${alertId}/resolve`, { resolveNote });
}

// ==================== 性能统计 API ====================

/**
 * 获取性能统计数据
 */
export async function getPerformanceStats(params?: {
  startDate?: string;
  endDate?: string;
  processDefKey?: string;
}): Promise<PerformanceStats[]> {
  return request.get('/workflow/monitor/performance/stats', { params });
}

/**
 * 获取监控概览
 */
export async function getMonitorOverview(): Promise<MonitorOverview> {
  return request.get('/workflow/monitor/overview');
}

/**
 * 获取流程趋势数据（用于图表）
 */
export async function getProcessTrend(params?: {
  days?: number;
  processDefKey?: string;
}): Promise<ProcessTrend[]> {
  return request.get('/workflow/monitor/trend', { params });
}

// ==================== 导出 ====================

export default {
  // 流程监控
  getProcessMonitors,
  getProcessMonitor,
  
  // 超时告警
  getTimeoutAlerts,
  handleTimeoutAlert,
  getTimeoutEscalationTasks,
  resolveTimeoutAlert,
  
  // 异常告警
  getAnomalyAlerts,
  resolveAnomalyAlert,
  
  // 性能统计
  getPerformanceStats,
  getMonitorOverview,
  getProcessTrend,
};
