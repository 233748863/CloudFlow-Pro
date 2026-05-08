package com.cloudflow.oa.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class ProjectKpiVO {
    private Integer overdueMilestoneCount;
    private Integer overdueTaskCount;
    private Integer openRiskCount;
    private BigDecimal scheduleVarianceDays;
    private BigDecimal costExecutionRate;
}
