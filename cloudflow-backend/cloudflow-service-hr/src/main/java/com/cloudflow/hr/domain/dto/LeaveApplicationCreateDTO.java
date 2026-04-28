package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class LeaveApplicationCreateDTO {

    @NotNull(message = "employeeId is required")
    private Long employeeId;

    @NotNull(message = "leaveTypeId is required")
    private Long leaveTypeId;

    @NotNull(message = "startTime is required")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @NotNull(message = "endTime is required")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    private BigDecimal duration;

    private String unit;

    private String periodType;

    private String reason;
}
