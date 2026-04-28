package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

@Data
public class EmergencyContactCreateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotNull(message = "employeeId is required")
    private Long employeeId;

    @NotBlank(message = "contactName is required")
    private String contactName;

    @NotBlank(message = "relationship is required")
    private String relationship;

    @NotBlank(message = "phone is required")
    private String phone;

    private String address;

    private Integer priority;
}
