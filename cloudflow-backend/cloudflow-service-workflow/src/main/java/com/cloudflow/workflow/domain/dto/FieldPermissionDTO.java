package com.cloudflow.workflow.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record FieldPermissionDTO(
        @NotBlank @Size(max = 64) String nodeKey,
        @NotBlank @Size(max = 100) String fieldId,
        @NotNull Boolean visibleFlag,
        @NotNull Boolean editableFlag,
        Boolean requiredFlag) {
}
