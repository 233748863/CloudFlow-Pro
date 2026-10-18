package com.cloudflow.hr.domain.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class HrPayrollCorrectionRequest {
    private Long originalSlipId;
    private Long payrollPeriodId;
    private BigDecimal grossAdjustment;
    private BigDecimal deductionAdjustment;
    private List<Long> advanceRepaymentIds;
    private String reason;
}
