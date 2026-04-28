package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工VO。
 */
@Data
public class EmployeeVO {

    private Long id;

    private String employeeNo;

    private String name;

    private String gender;

    private LocalDate birthDate;

    private String phone;

    private String email;

    private Long deptId;

    private String deptName;

    private Long postId;

    private String postName;

    private String employeeType;

    private String employeeStatus;

    private LocalDate hireDate;

    private LocalDate regularDate;

    private LocalDate resignDate;

    private Long userId;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
