package com.cloudflow.hr.domain.vo;

import lombok.Data;

@Data
public class PerformanceOverviewVO {

    private Long draftCount;

    private Long planApprovingCount;

    private Long runningCount;

    private Long resultApprovingCount;

    private Long completedCount;
}
