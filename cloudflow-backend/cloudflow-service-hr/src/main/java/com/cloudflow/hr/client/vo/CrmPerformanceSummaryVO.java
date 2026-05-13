package com.cloudflow.hr.client.vo;

import lombok.Data;

import java.math.BigDecimal;

/**
 * CRM 销售业绩聚合视图，与 crm-service 侧 CrmPerformanceSummaryVO 对齐。
 */
@Data
public class CrmPerformanceSummaryVO {

    private String dimension;

    private Long targetId;

    private String targetName;

    private long wonOpportunityCount;

    private BigDecimal wonAmount;

    private BigDecimal contractAmount;

    private BigDecimal receivedAmount;

    private BigDecimal outstandingAmount;

    private long followUpCount;

    private long customerCount;
}
