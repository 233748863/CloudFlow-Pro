package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@TableName(value = "hr_salary_slip", autoResultMap = true)
public class HrSalarySlipPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private String periodMonth;
    private BigDecimal grossTotal;
    private BigDecimal deductionTotal;
    private BigDecimal netTotal;
    private BigDecimal taxAmount;
    private BigDecimal benefitAmount;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> components;

    private LocalDate payDate;
    private String status;
    private Boolean employeeConfirmed;
    private LocalDateTime confirmedTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
