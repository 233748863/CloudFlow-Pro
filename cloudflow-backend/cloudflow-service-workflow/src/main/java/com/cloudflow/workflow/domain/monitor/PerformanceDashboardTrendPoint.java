package com.cloudflow.workflow.domain.monitor;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDate;

@Data
public class PerformanceDashboardTrendPoint {

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate statDate;

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
}
