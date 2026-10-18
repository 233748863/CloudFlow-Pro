package com.cloudflow.workflow.strategy.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import com.cloudflow.workflow.strategy.AssigneeResolutionException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class VariableUserAssignStrategy implements AssignUserStrategy {
    private final ObjectMapper objectMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        List<Long> users = resolveMultiple(node, instance);
        if (users.size() > 1) throw new AssigneeResolutionException("流程变量包含多名审批人，请配置会签节点");
        return users.isEmpty() ? null : users.get(0);
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        if (!StringUtils.hasText(node.getApproverValue()) || !StringUtils.hasText(instance.getVariables())) return List.of();
        try {
            Map<String, Object> variables = objectMapper.readValue(instance.getVariables(), new TypeReference<Map<String, Object>>() { });
            Object value = variables.get(node.getApproverValue());
            if (value == null) return List.of();
            List<?> values = value instanceof List<?> collection ? collection : List.of(value);
            LinkedHashSet<Long> users = new LinkedHashSet<>();
            for (Object item : values) {
                if (!(item instanceof String) && !(item instanceof Number)) throw new IllegalArgumentException("审批人必须为用户标识");
                long userId = new BigDecimal(String.valueOf(item)).longValueExact();
                if (userId <= 0) throw new IllegalArgumentException("审批人标识必须为正整数");
                users.add(userId);
            }
            return List.copyOf(users);
        } catch (Exception exception) {
            throw new AssigneeResolutionException("流程变量审批人无效：" + node.getApproverValue());
        }
    }

    @Override
    public boolean supports(String approverType) { return "VARIABLE_USER".equals(approverType); }

    @Override
    public String getDescription(String approverType, String approverValue) {
        return StringUtils.hasText(approverValue) ? "流程变量：" + approverValue : "流程变量用户";
    }
}
