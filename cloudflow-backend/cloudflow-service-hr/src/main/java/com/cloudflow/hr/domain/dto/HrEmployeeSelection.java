package com.cloudflow.hr.domain.dto;

import lombok.Data;
import java.util.List;

@Data
public class HrEmployeeSelection {
    private List<Long> employeeIds;
    private List<Long> deptIds;
    private List<Long> positionIds;
    private List<Long> jobLevelIds;
    private String employeeType;
}
