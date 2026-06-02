package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@TableName(value = "hr_benefit_payment", autoResultMap = true)
public class HrBenefitPaymentPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private Long schemeId;
    private String periodMonth;
    private BigDecimal baseAmount;
    private BigDecimal companyAmount;
    private BigDecimal personalAmount;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> items;

    private String status;
    private LocalDate payDate;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
