package com.cloudflow.oa.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class ProjectCostSummaryVO {

    private Long projectId;
    private BigDecimal expenseAmount = BigDecimal.ZERO;
    private BigDecimal purchaseAmount = BigDecimal.ZERO;
    private BigDecimal paymentAmount = BigDecimal.ZERO;
    private BigDecimal totalAmount = BigDecimal.ZERO;
}
