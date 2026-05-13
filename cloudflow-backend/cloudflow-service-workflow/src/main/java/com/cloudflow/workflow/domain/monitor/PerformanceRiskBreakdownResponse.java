package com.cloudflow.workflow.domain.monitor;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class PerformanceRiskBreakdownResponse {

    private List<PerformanceTimeoutLevelBreakdownItem> timeoutLevels = new ArrayList<>();

    private List<PerformanceAnomalyTypeBreakdownItem> anomalyTypes = new ArrayList<>();

    private PerformanceRiskBreakdownTotals totals;
}
