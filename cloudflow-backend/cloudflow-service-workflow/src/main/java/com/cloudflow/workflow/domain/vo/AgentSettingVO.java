package com.cloudflow.workflow.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDateTime;
import java.util.List;

public record AgentSettingVO(String settingId, Long agentUserId, String agentUserName,
                              String agentMode, List<String> definitionIds,
                              @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
                              @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
                              String reason, String status, String effectiveStatus, Integer version,
                              List<String> affectedTaskIds) {
}
