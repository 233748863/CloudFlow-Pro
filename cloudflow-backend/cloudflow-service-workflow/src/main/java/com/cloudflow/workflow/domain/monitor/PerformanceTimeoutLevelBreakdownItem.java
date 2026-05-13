package com.cloudflow.workflow.domain.monitor;

import lombok.Data;

@Data
public class PerformanceTimeoutLevelBreakdownItem {

    private String level;

    private String label;

    private Integer count;

    private Double rate;
}
