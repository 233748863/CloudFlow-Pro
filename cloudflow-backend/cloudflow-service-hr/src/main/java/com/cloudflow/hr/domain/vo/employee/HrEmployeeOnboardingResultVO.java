package com.cloudflow.hr.domain.vo.employee;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class HrEmployeeOnboardingResultVO {

    private Long applicationId;
    private String applicationNo;
    private String processInstanceId;
}
