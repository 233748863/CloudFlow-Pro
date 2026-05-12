package com.cloudflow.workflow.domain.monitor;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class PerformanceDashboardResponse {

    private PerformanceDashboardContext context;

    private PerformanceDashboardSummary summary;

    private PerformanceDashboardSummary compareSummary;

    private List<PerformanceDashboardTrendPoint> trend = new ArrayList<>();

    private List<PerformanceDashboardProcessRow> processes = new ArrayList<>();
}
