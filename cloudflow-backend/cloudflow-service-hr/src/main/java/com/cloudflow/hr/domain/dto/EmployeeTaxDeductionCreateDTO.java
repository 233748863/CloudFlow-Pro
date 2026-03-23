package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 员工专项扣除创建DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmployeeTaxDeductionCreateDTO {
    
    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;
    
    /**
     * 扣除类型
     * CHILD_EDU-子女教育
     * CONTINUING_EDU-继续教育
     * MEDICAL-大病医疗
     * HOUSING_LOAN-住房贷款利息
     * HOUSING_RENT-住房租金
     * ELDERLY_CARE-赡养老人
     */
    @NotNull(message = "扣除类型不能为空")
    private String deductionType;
    
    /**
     * 扣除金额（每月）
     */
    @NotNull(message = "扣除金额不能为空")
    private BigDecimal amount;
    
    /**
     * 开始日期
     */
    @NotNull(message = "开始日期不能为空")
    private LocalDate startDate;
    
    /**
     * 结束日期
     */
    private LocalDate endDate;
    
    /**
     * 备注
     */
    private String remark;
}
