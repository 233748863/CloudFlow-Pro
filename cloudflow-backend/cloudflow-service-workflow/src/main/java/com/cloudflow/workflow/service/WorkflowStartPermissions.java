package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;

import java.util.LinkedHashSet;
import java.util.Set;

/** 发起权限值使用JSON字符串编号数组，编号不经过JavaScript浮点转换。 */
public final class WorkflowStartPermissions {
    private static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final Set<String> TYPES = Set.of("ALL", "ROLE", "DEPT", "USER");

    private WorkflowStartPermissions() {
    }

    public static void validate(WfProcessDefinition definition) {
        String type = definition.getStartPermissionType();
        validate(type, definition.getStartPermissionValue());
        if ("ALL".equals(type)) {
            definition.setStartPermissionValue("");
        }
    }

    public static void validate(String type, String value) {
        if (type == null || !TYPES.contains(type)) {
            throw WorkflowException.validationError("启动权限类型须明确为ALL、ROLE、DEPT或USER");
        }
        if ("ALL".equals(type)) {
            if (value != null && !value.isBlank()) {
                throw WorkflowException.validationError("所有人可发起时不可指定权限对象");
            }
        } else if (identifiers(value).isEmpty()) {
            throw WorkflowException.validationError("请至少指定一个可发起流程的权限对象");
        }
    }

    public static Set<Long> identifiers(String value) {
        if (value == null || value.isBlank()) {
            return Set.of();
        }
        try {
            JsonNode array = JSON.readTree(value);
            if (array == null || !array.isArray()) {
                throw WorkflowException.validationError("启动权限值须为JSON字符串编号数组");
            }
            Set<Long> result = new LinkedHashSet<>();
            for (JsonNode item : array) {
                if (!item.isTextual() || !item.textValue().matches("[1-9][0-9]*")) {
                    throw WorkflowException.validationError("启动权限对象须为正整数编号字符串");
                }
                Long identifier = Long.valueOf(item.textValue());
                if (!result.add(identifier)) {
                    throw WorkflowException.validationError("启动权限对象不可重复");
                }
            }
            return result;
        } catch (JsonProcessingException | NumberFormatException invalid) {
            throw WorkflowException.validationError("启动权限值不是有效的编号数组");
        }
    }
}
