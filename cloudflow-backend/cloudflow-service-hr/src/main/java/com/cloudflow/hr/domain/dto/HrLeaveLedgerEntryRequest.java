package com.cloudflow.hr.domain.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class HrLeaveLedgerEntryRequest {
    private Long employeeId;
    private Long leaveTypeId;
    private Long periodId;
    private String transactionType;
    private String sourceId;
    private BigDecimal quantity;
    private BigDecimal encashmentAmount;
    private LocalDate effectiveDate;
    private String remark;
}
