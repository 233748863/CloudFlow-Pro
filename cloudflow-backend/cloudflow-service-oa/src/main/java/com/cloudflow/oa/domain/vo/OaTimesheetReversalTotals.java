package com.cloudflow.oa.domain.vo;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class OaTimesheetReversalTotals {
    private BigDecimal hours = BigDecimal.ZERO;
    private BigDecimal costingAmount = BigDecimal.ZERO;
    private BigDecimal billingAmount = BigDecimal.ZERO;
}
