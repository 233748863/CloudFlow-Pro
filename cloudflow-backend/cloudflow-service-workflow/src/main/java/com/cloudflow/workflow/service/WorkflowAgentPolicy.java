package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfAgentSetting;
import com.cloudflow.workflow.domain.dto.AgentSettingRequest;
import com.cloudflow.workflow.exception.WorkflowException;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class WorkflowAgentPolicy {
    private WorkflowAgentPolicy() {
    }

    public static List<String> validate(AgentSettingRequest request, Long principalId) {
        if (request == null || request.agentUserId() == null || request.agentUserId() <= 0
                || Objects.equals(principalId, request.agentUserId())
                || !Set.of("AGENT", "AGENT_ASSIST").contains(Objects.toString(request.agentMode(), ""))
                || request.startTime() == null || request.endTime() == null
                || !request.endTime().isAfter(request.startTime())
                || request.startTime().getNano() != 0 || request.endTime().getNano() != 0
                || request.reason() != null && request.reason().length() > 500
                || request.version() != null && request.version() < 0) {
            throw WorkflowException.validationError("请选择其他启用用户、代理模式及有效的起止时间");
        }
        List<String> definitions = request.definitionIds() == null ? List.of() : request.definitionIds();
        if (definitions.stream().anyMatch(definition -> definition == null || definition.isBlank()
                || definition.length() > 64 || !definition.equals(definition.trim()))) {
            throw WorkflowException.validationError("流程范围包含无效的流程定义编号");
        }
        return new LinkedHashSet<>(definitions).stream().sorted().toList();
    }

    public static boolean active(WfAgentSetting setting, LocalDateTime now) {
        return setting != null && "ACTIVE".equals(setting.getStatus())
                && setting.getStartTime() != null && setting.getEndTime() != null
                && !now.isBefore(setting.getStartTime()) && now.isBefore(setting.getEndTime());
    }

    public static boolean overlaps(WfAgentSetting existing, AgentSettingRequest request,
                                   List<String> existingDefinitions, List<String> requestedDefinitions) {
        return "ACTIVE".equals(existing.getStatus())
                && request.startTime().isBefore(existing.getEndTime())
                && existing.getStartTime().isBefore(request.endTime())
                && (existingDefinitions.isEmpty() || requestedDefinitions.isEmpty()
                || existingDefinitions.stream().anyMatch(requestedDefinitions::contains));
    }

    public static String effectiveStatus(WfAgentSetting setting, LocalDateTime now) {
        if (!"ACTIVE".equals(setting.getStatus())) return "DISABLED";
        if (now.isBefore(setting.getStartTime())) return "SCHEDULED";
        return now.isBefore(setting.getEndTime()) ? "EFFECTIVE" : "EXPIRED";
    }
}
