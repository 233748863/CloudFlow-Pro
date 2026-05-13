package com.cloudflow.workflow.domain.monitor;

import lombok.Data;

@Data
public class PerformanceAnomalyTypeBreakdownItem {

    private String type;

    private String label;

    private Integer count;

    private Double rate;
}
