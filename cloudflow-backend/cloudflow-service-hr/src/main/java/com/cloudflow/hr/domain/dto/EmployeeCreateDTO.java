package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDate;

@Data
public class EmployeeCreateDTO {

    @NotBlank(message = "employeeNo is required")
    private String employeeNo;

    @NotBlank(message = "name is required")
    private String name;

    @NotBlank(message = "gender is required")
    private String gender;

    private LocalDate birthDate;

    private String phone;

    @Email(message = "email format is invalid")
    private String email;

    private Long deptId;

    private Long postId;

    @NotBlank(message = "employeeType is required")
    private String employeeType;

    @NotBlank(message = "employeeStatus is required")
    private String employeeStatus;

    private LocalDate hireDate;

    private Long userId;
}
