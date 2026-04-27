package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 创建调薪申请DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class SalaryAdjustmentCreateDTO {
    
    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;
    
    /**
     * 调薪类型：PROMOTION-晋升调薪 ANNUAL-年度调薪 PERFORMANCE-绩效调薪 MARKET-市场调薪
     */
    @NotBlank(message = "调薪类型不能为空")
    private String adjustmentType;
    
    /**
     * 调薪原因
     */
    private String adjustmentReason;
    
    /**
     * 调薪后薪资数据（JSON）
     */
    @NotBlank(message = "调薪后薪资数据不能为空")
    private String afterSalaryData;
    
    /**
     * 调薪后总额
     */
    @NotNull(message = "调薪后总额不能为空")
    private BigDecimal afterTotal;
    
    /**
     * 生效日期
     */
    @NotNull(message = "生效日期不能为空")
    private LocalDate effectiveDate;

    /**
     * 来源类型：PERFORMANCE_OBJECTIVE 等
     */
    private String sourceType;

    /**
     * 来源业务ID
     */
    private Long sourceId;
}
