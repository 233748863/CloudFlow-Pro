package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@TableName(value = "hr_attendance_rule", autoResultMap = true)
public class HrAttendanceRulePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String ruleCode;
    private String ruleName;
    private String ruleType;
    private Long shiftId;
    private Integer status;
    private LocalDateTime createTime;
    @Version
    private Integer version;
    private LocalDateTime updateTime;

    @JsonIgnore
    @TableField(value = "check_methods", typeHandler = JacksonTypeHandler.class)
    private JsonNode checkMethodsJson;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode configJson;

    public List<String> getCheckMethods() {
        if (checkMethodsJson == null || !checkMethodsJson.isArray()) return null;
        List<String> methods = new ArrayList<>();
        for (JsonNode method : checkMethodsJson) {
            if (!method.isTextual()) return null;
            methods.add(method.textValue());
        }
        return methods;
    }

    public void setCheckMethods(List<String> methods) {
        if (methods == null) { checkMethodsJson = null; return; }
        ArrayNode values = JsonNodeFactory.instance.arrayNode();
        methods.forEach(values::add);
        checkMethodsJson = values;
    }

    public boolean hasValidCheckMethods() {
        if (checkMethodsJson == null || checkMethodsJson.isNull()) return true;
        if (!checkMethodsJson.isArray()) return false;
        for (JsonNode method : checkMethodsJson) {
            if (!method.isTextual() || !List.of("APP", "FACE", "CARD", "WIFI", "GPS").contains(method.textValue())) return false;
        }
        return true;
    }
}
