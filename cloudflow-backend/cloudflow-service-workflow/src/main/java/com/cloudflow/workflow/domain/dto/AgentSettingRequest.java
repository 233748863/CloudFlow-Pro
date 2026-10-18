package com.cloudflow.workflow.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public record AgentSettingRequest(
        @NotNull @Min(1) Long agentUserId,
        @NotNull @Pattern(regexp = "AGENT|AGENT_ASSIST") String agentMode,
        List<@NotNull @Size(min = 1, max = 64) String> definitionIds,
        @NotNull @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
        @NotNull @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
        @Size(max = 500) String reason,
        @Min(0) Integer version) {
}
