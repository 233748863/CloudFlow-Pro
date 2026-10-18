package com.cloudflow.crm.domain.vo;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CrmPerformanceAggregateRow extends CrmPerformanceSummaryVO {
    private Integer invalidAllocationCount;
}
