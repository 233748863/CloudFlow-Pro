package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class LeaveTypeCreateDTO {

    @NotBlank(message = "leaveCode is required")
    private String leaveCode;

    @NotBlank(message = "leaveName is required")
    private String leaveName;

    @NotNull(message = "needQuota is required")
    private Boolean needQuota;

    @NotNull(message = "isPaid is required")
    private Boolean isPaid;

    @NotBlank(message = "unit is required")
    private String unit;

    private String quotaRule;

    private String expiryRule;
}
