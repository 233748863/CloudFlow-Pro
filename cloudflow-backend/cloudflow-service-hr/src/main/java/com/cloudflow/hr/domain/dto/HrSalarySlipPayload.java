package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.cloudflow.hr.config.HrSalaryJsonTypeHandler;
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
    private Long batchId;
    private String periodMonth;
    private BigDecimal grossTotal;
    private BigDecimal deductionTotal;
    private BigDecimal netTotal;
    private BigDecimal taxAmount;
    private BigDecimal benefitAmount;
    private BigDecimal cumulativeTaxableIncome;
    private BigDecimal cumulativeDeduction;
    private BigDecimal cumulativeTaxPayable;
    private BigDecimal cumulativeTaxPaid;
    private BigDecimal currentTax;

    @TableField(typeHandler = HrSalaryJsonTypeHandler.class)
    private List<Map<String, Object>> components;

    private LocalDate payDate;
    private String status;
    private Boolean employeeConfirmed;
    private LocalDateTime confirmedTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private String digestSha256;
    private Integer deleted;
    @Version
    private Integer version;
}
