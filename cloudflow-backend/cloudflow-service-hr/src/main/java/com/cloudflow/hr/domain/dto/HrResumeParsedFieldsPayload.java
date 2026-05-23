package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR-P1-1 简历解析字段。
 */
@Data
@TableName(value = "hr_resume_parsed_fields", autoResultMap = true)
public class HrResumeParsedFieldsPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long candidateId;
    private String resumeUrl;
    private String parsedName;
    private String parsedPhone;
    private String parsedEmail;
    private String parsedEducation;
    private String parsedSchool;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode parsedSkills;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode parsedExperiences;

    private String rawText;
    private BigDecimal confidence;
    private String reviewStatus;
    private Long reviewerId;
    private String reviewerName;
    private LocalDateTime reviewTime;
    private String parseError;

    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
