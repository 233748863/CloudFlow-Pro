package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 薪资等级设置DTO
 */
@Data
public class SalaryGradeSetDTO {
    
    /**
     * 职级ID
     */
    @NotNull(message = "职级ID不能为空")
    private Long levelId;
    
    /**
     * 最低薪资
     */
    @NotNull(message = "最低薪资不能为空")
    private BigDecimal minSalary;
    
    /**
     * 最高薪资
     */
    @NotNull(message = "最高薪资不能为空")
    private BigDecimal maxSalary;
    
    /**
     * 中位薪资
     */
    @NotNull(message = "中位薪资不能为空")
    private BigDecimal midSalary;
    
    /**
     * 币种：CNY-人民币 USD-美元
     */
    private String currency;
}
