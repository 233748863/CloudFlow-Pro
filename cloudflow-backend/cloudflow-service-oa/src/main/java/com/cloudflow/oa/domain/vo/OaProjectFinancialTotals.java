package com.cloudflow.oa.domain.vo;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class OaProjectFinancialTotals {
    private BigDecimal laborCostAmount = BigDecimal.ZERO;
    private BigDecimal billableAmount = BigDecimal.ZERO;
    private BigDecimal actualHours = BigDecimal.ZERO;
    private BigDecimal purchaseCostAmount = BigDecimal.ZERO;
    private BigDecimal billedAmount = BigDecimal.ZERO;
}
