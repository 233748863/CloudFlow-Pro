package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName(value = "hr_benefit_scheme", autoResultMap = true)
public class HrBenefitSchemePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String schemeCode;
    private String schemeName;
    private String city;
    private LocalDate effectiveDate;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode benefitConfig;
}
