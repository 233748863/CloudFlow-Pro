package com.cloudflow.workflow.domain.monitor;

import lombok.Data;

/**
 * 监控概览数据
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Data
public class MonitorOverview {
    
    // 今日统计
    private Integer todayStarted;
    private Integer todayCompleted;
    private Integer todayTimeout;
    private Integer todayAnomaly;
    
    // 当前状态
    private Integer runningCount;
    private Integer pendingTaskCount;
    
    // 告警统计
    private Integer warningAlertCount;
    private Integer criticalAlertCount;
    private Integer unresolvedAnomalyCount;
    
    // 性能指标
    private Long avgCompletionTimeMs;
    private Double successRate;
}
