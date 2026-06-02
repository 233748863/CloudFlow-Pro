package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName(value = "hr_performance_objective", autoResultMap = true)
public class HrPerformanceObjectivePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String objectiveNo;
    private String cycleName;
    private LocalDate cycleStartDate;
    private LocalDate cycleEndDate;
    private String objectiveName;
    private Long ownerEmployeeId;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode metricConfig;

    private String status;
    private String planProcessInstanceId;
    private String resultProcessInstanceId;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
