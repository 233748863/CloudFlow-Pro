package com.cloudflow.hr.domain.dto;

import lombok.Data;

@Data
public class EmployeeQueryDTO {

    private String employeeNo;

    private String name;

    private Long deptId;

    private Long postId;

    private String employeeType;

    private String employeeStatus;
}
