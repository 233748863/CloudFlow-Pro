package com.cloudflow.hr.domain.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDate;

@Data
@EqualsAndHashCode(callSuper = true)
public class HrAttendanceRecalcRequest extends HrEmployeeSelection {
    private LocalDate startDate;
    private LocalDate endDate;
    private boolean forceOverwrite;
    private boolean confirmed;
}
