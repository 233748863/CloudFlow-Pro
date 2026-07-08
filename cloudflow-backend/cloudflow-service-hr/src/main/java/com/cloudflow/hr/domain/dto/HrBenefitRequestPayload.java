package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_benefit_request", autoResultMap = true)
public class HrBenefitRequestPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String requestNo;
    private Long employeeId;
    private Long schemeId;
    private String requestType;
    private BigDecimal amount;
    private Integer pointAmount;
    private String reason;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Object> attachments;

    private String status;
    private String processInstanceId;
    private Long approverId;
    private LocalDateTime paidAt;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
