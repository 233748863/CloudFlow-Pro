package com.cloudflow.workflow.domain.monitor;

import lombok.Data;

@Data
public class PerformanceRiskBreakdownTotals {

    private Integer timeoutTotal;

    private Integer anomalyTotal;
}
