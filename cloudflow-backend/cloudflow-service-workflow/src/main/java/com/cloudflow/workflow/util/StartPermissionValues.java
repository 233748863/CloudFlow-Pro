package com.cloudflow.workflow.util;

import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashSet;
import java.util.Set;

/** 启动权限唯一格式：用户、角色或部门编号的字符串数组 JSON。 */
public final class StartPermissionValues {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> TYPES = Set.of("ALL", "USER", "ROLE", "DEPT");

    private StartPermissionValues() {}

    public static void validate(String type, String value) {
        if (type == null || "ALL".equals(type)) {
            if (value != null && !value.isBlank() && !parse(value).isEmpty()) {
                throw WorkflowException.validationError("所有人启动权限不能指定人员范围");
            }
            return;
        }
        if (!TYPES.contains(type)) {
            throw WorkflowException.validationError("不支持的启动权限类型：" + type);
        }
        if (parse(value).isEmpty()) {
            throw WorkflowException.validationError("请至少选择一个启动权限对象");
        }
    }

    public static Set<String> parse(String value) {
        if (value == null || value.isBlank()) {
            throw WorkflowException.validationError("启动权限值必须为编号字符串数组");
        }
        try {
            JsonNode array = JSON.readTree(value);
            if (array == null || !array.isArray()) {
                throw WorkflowException.validationError("启动权限值必须为编号字符串数组");
            }
            Set<String> ids = new LinkedHashSet<>();
            for (JsonNode id : array) {
                if (!id.isTextual() || !id.textValue().matches("[1-9][0-9]*")) {
                    throw WorkflowException.validationError("启动权限仅接受编号字符串，不接受角色键或数字值");
                }
                ids.add(id.textValue());
            }
            return ids;
        } catch (JsonProcessingException e) {
            throw WorkflowException.validationError("启动权限值不是有效 JSON 数组");
        }
    }
}
