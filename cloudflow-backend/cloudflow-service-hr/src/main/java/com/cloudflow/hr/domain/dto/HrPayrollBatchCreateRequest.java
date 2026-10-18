package com.cloudflow.hr.domain.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDate;

@Data
@EqualsAndHashCode(callSuper = true)
public class HrPayrollBatchCreateRequest extends HrEmployeeSelection {
    private Long payrollPeriodId;
    private LocalDate postingDate;
    private Integer validateAttendanceFlag = 1;
    private Integer deductUnverifiedFlag = 0;
}
