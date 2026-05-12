package com.cloudflow.workflow.domain.monitor;

import lombok.Data;

@Data
public class PerformanceDashboardProcessRow {

    private String processDefKey;

    private String processName;

    private Integer totalCount;

    private Integer completedCount;

    private Integer failedCount;

    private Long avgDurationMs;

    private Long minDurationMs;

    private Long maxDurationMs;

    private Double successRate;

    private Double failedRate;

    private Integer timeoutInstanceCount;

    private Integer timeoutEventCount;

    private Double timeoutInstanceRate;

    private Integer anomalyInstanceCount;

    private Integer anomalyEventCount;

    private Double anomalyInstanceRate;

    private String healthLabel;

    private Double riskScore;
}
