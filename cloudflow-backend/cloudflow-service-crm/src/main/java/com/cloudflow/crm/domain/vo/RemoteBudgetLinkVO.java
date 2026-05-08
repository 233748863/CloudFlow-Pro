package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class RemoteBudgetLinkVO {
    private Long budgetId;
    private String budgetNo;
    private String budgetName;
    private Long projectId;
    private String projectName;
    private BigDecimal totalAmount;
    private BigDecimal reservedAmount;
    private BigDecimal actualAmount;
    private BigDecimal availableAmount;
    private String status;
    private String thresholdStatus;
}
