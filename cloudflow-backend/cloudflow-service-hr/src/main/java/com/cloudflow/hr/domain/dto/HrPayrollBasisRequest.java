package com.cloudflow.hr.domain.dto;

import lombok.Data;

@Data
public class HrPayrollBasisRequest {
    private String salaryBasis;
    private String prorationBasis;
    private String benefitTiming;
}
