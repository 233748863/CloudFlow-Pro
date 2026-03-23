package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 员工专项扣除更新DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmployeeTaxDeductionUpdateDTO {
    
    /**
     * 扣除金额（每月）
     */
    private BigDecimal amount;
    
    /**
     * 开始日期
     */
    private LocalDate startDate;
    
    /**
     * 结束日期
     */
    private LocalDate endDate;
    
    /**
     * 状态：ACTIVE-生效中 EXPIRED-已过期
     */
    private String status;
    
    /**
     * 备注
     */
    private String remark;
}
