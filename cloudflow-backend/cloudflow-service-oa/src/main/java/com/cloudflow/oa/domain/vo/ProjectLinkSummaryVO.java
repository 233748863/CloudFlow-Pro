package com.cloudflow.oa.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class ProjectLinkSummaryVO {
    private String sourceType;
    private Long sourceId;
    private String sourceName;
    private Long contractId;
    private String contractNo;
    private String customerName;
    private String budgetSummary;
    private String invoiceSummary;
    private BigDecimal expenseAmount;
    private BigDecimal purchaseAmount;
    private BigDecimal paymentAmount;
}
