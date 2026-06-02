package com.cloudflow.common.core.event;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;

@Data
public class EmployeeOffboardEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long employeeId;
    private Long userId;
    private String employeeName;
    private Long deptId;
    private String deptName;
    private Long successorUserId;
    private LocalDate lastWorkDate;
}
