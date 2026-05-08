package com.cloudflow.oa.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class BudgetExecutionSummaryVO {

    private Long budgetId;
    private String budgetNo;
    private String budgetName;
    private BigDecimal totalAmount;
    private BigDecimal reservedAmount;
    private BigDecimal actualAmount;
    private BigDecimal availableAmount;
    private BigDecimal executionRatio;
    private String thresholdStatus;
    private BigDecimal warningThreshold;
    private BigDecimal alertThreshold;
    private BigDecimal blockThreshold;
}
