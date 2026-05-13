package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.domain.monitor.*;

import java.time.LocalDate;
import java.util.List;

/**
 * 工作流监控服务接口
 * Phase 2 新增功能
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
public interface WorkflowMonitorService {

    /**
     * 获取监控概览数据
     */
    MonitorOverview getMonitorOverview();

    /**
     * 获取流程趋势数据
     */
    List<ProcessTrend> getProcessTrend(Integer days, String processDefKey);

    /**
     * 获取流程监控列表
     */
    PageResult<ProcessMonitor> getProcessMonitors(String processDefKey, String status, 
                                     String startTimeFrom, String startTimeTo,
                                     Integer pageNum, Integer pageSize);

    /**
     * 获取流程监控详情
     */
    ProcessMonitor getProcessMonitor(String instanceId);

    /**
     * 获取超时告警列表
     */
    PageResult<TimeoutAlert> getTimeoutAlerts(String alertType, String alertLevel, 
                                   Boolean resolved, Integer pageNum, Integer pageSize);

    /**
     * 处理超时告警
     */
    TimeoutAlertHandleResult handleTimeoutAlert(Long alertId, String action);

    /**
     * 获取当前用户的升级待办
     */
    PageResult<TimeoutAlert> getTimeoutEscalationTasks(Integer pageNum, Integer pageSize);

    /**
     * 解决超时告警
     */
    TimeoutAlert resolveTimeoutAlert(Long alertId, String resolveNote);

    /**
     * 获取异常告警列表
     */
    PageResult<AnomalyAlert> getAnomalyAlerts(String anomalyType, String severity, 
                                   Boolean resolved, Integer pageNum, Integer pageSize);

    /**
     * 解决异常告警
     */
    void resolveAnomalyAlert(Long alertId, String resolveNote);

    /**
     * 获取性能分析看板
     */
    PerformanceDashboardResponse getPerformanceDashboard(LocalDate startDate, LocalDate endDate,
                                                         String processDefKey);

    /**
     * 获取风险拆解数据
     */
    PerformanceRiskBreakdownResponse getPerformanceRiskBreakdown(LocalDate startDate, LocalDate endDate,
                                                                 String processDefKey);

    /**
     * 获取性能统计数据
     */
    List<PerformanceStats> getPerformanceStats(LocalDate startDate, LocalDate endDate, 
                                               String processDefKey);
}
