package com.cloudflow.hr.domain.vo.settlement;

import com.cloudflow.hr.domain.dto.HrSeveranceRuleRequests;
import java.time.LocalDateTime;
import java.util.List;

public record HrSeveranceRuleView(Long ruleId, String ruleCode, HrSeveranceRuleRequests.Settings settings,
        List<Component> salaryComponents, PolicyFile policyFile, List<String> missingRequirements,
        String status, Long confirmedBy, LocalDateTime confirmedTime, Integer version, boolean editable) {
    public record Component(Long value, String label, String componentType, Integer version) { }
    public record PolicyFile(Long fileId, String fileName, long fileSize) { }
}
