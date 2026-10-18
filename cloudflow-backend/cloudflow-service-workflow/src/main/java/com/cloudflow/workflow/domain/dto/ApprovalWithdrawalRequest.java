package com.cloudflow.workflow.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ApprovalWithdrawalRequest(@NotBlank @Size(max = 64) String historyId) {
}
