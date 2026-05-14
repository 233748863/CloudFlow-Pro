package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class HrPerformanceSalaryAdjustmentRequest {

    private Long employeeId;
    private String adjustmentReason;
    private BigDecimal minScore;
    private String afterSalaryData;
    private BigDecimal afterTotal;
    private String effectiveDate;
}
