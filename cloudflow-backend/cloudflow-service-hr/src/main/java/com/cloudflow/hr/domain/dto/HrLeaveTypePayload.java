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

@Data
@TableName(value = "hr_leave_type", autoResultMap = true)
public class HrLeaveTypePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String leaveCode;
    private String leaveName;
    private Integer needQuota;
    private Integer isPaid;
    private String unit;
    private Integer status;
    private LocalDateTime createTime;
    @Version
    private Integer version;
    private LocalDateTime updateTime;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode quotaRule;
}
