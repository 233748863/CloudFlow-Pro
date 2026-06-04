package com.cloudflow.auth.service.remote;

import lombok.Data;

import java.time.LocalDate;

@Data
public class RemoteHrEmployeeSummaryVO {

    private Long employeeId;

    private Long userId;

    private String employeeNo;

    private String employeeName;

    private Long deptId;

    private String deptName;

    private Long positionId;

    private String positionName;

    private String status;

    private boolean active;

    private LocalDate birthDate;
}
