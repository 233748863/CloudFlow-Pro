package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.time.LocalDateTime;
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

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Integer> workDays;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> checkMethods;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode configJson;
}
