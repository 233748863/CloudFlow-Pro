package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName(value = "hr_lifecycle_detail", autoResultMap = true)
public class HrLifecycleDetailPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long applicationId;
    private String detailType;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode detailJson;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
