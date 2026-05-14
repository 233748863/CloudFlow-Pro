package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class HrPerformanceResultUpdatePayload {

    private Long assignmentId;
    private BigDecimal actualAmount;
}
