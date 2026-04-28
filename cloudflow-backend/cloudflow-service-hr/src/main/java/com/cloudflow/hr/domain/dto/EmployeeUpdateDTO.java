package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.Email;
import lombok.Data;

import java.time.LocalDate;

@Data
public class EmployeeUpdateDTO {

    private String name;

    private String gender;

    private LocalDate birthDate;

    private String phone;

    @Email(message = "email format is invalid")
    private String email;

    private Long deptId;

    private Long postId;

    private String employeeType;

    private String employeeStatus;

    private LocalDate hireDate;

    private LocalDate regularDate;

    private LocalDate resignDate;

    private Long userId;
}
