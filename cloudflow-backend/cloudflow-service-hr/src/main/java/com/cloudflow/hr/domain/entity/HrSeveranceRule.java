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
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName(value = "hr_severance_rule", autoResultMap = true)
public class HrSeveranceRule implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long ruleId;
    private Long tenantId;
    private String ruleCode;
    private String ruleName;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate effectiveFrom;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate effectiveTo;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode salaryComponentIds;
    private Integer averagingMonths;
    private String serviceRounding;
    private BigDecimal socialMonthlySalary;
    private BigDecimal baseCapMultiplier;
    private BigDecimal maxCompensationMonths;
    private BigDecimal noticeMonths;
    private BigDecimal leaveDailyDivisor;
    private BigDecimal leaveHoursPerDay;
    private BigDecimal leaveCashMultiplier;
    private Long policyFileId;
    private Long confirmedBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime confirmedTime;
    private String status;
    private String remark;
    private Integer deleted;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
