package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_appraisal_cycle", autoResultMap = true)
public class HrAppraisalCycle implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long cycleId;
    private Long tenantId;
    private String cycleName;
    private String cycleType;
    private LocalDate startDate;
    private LocalDate endDate;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> scopeDeptIds;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> scopePositionIds;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> scopeJobLevelIds;
    private String evaluationMethod;
    private String finalScoreMode;
    private String finalScoreFormula;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode scoreConfig;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode frozenConfig;
    private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime completedTime;
    private String remark;
    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
