package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class OvertimeApplicationCreateDTO {

    @NotNull(message = "employeeId is required")
    private Long employeeId;

    @NotNull(message = "startTime is required")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @NotNull(message = "endTime is required")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    @NotBlank(message = "overtimeType is required")
    private String overtimeType;

    private String reason;

    @NotBlank(message = "compensationType is required")
    private String compensationType;
}
