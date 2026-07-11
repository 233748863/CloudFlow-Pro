package com.cloudflow.workflow.strategy.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Map;
import java.util.List;

/** 从流程变量读取单个用户 ID，approverValue 为变量名。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class VariableUserAssignStrategy implements AssignUserStrategy {

    private final ObjectMapper objectMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        if (!StringUtils.hasText(node.getApproverValue()) || !StringUtils.hasText(instance.getVariables())) {
            return null;
        }
        try {
            Map<String, Object> variables = objectMapper.readValue(
                    instance.getVariables(), new TypeReference<Map<String, Object>>() { });
            Object value = variables.get(node.getApproverValue());
            if (value instanceof Number number) {
                return number.longValue();
            }
            return value == null ? null : Long.valueOf(String.valueOf(value));
        } catch (Exception e) {
            log.warn("[VariableUserAssignStrategy] 无法从变量 {} 解析审批人: {}",
                    node.getApproverValue(), e.getMessage());
            return null;
        }
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        Long userId = resolve(node, instance);
        return userId == null ? List.of() : List.of(userId);
    }

    @Override
    public boolean supports(String approverType) {
        return "VARIABLE_USER".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        return StringUtils.hasText(approverValue) ? "流程变量：" + approverValue : "流程变量用户";
    }
}
