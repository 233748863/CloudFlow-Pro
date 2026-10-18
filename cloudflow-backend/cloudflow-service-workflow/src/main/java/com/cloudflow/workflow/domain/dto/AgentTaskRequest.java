package com.cloudflow.workflow.domain.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AgentTaskRequest(@NotBlank @Size(max = 64) String taskId,
                               @NotNull @Min(0) Integer version,
                               @Size(max = 500) String reason,
                               @Size(max = 1000) String comment) {
}
