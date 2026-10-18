package com.cloudflow.hr.domain.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDate;

@Data
@EqualsAndHashCode(callSuper = true)
public class HrLeavePolicyAssignRequest extends HrEmployeeSelection {
    private Long policyId;
    private Long periodId;
    private String assignmentBasis = "PERIOD";
    private LocalDate effectiveFrom;
    private LocalDate effectiveTo;
    private Integer carryForwardFlag = 0;
}
