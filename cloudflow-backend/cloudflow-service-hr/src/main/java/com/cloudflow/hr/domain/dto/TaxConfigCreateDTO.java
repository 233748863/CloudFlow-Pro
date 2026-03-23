package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 个税配置创建DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class TaxConfigCreateDTO {
    
    /**
     * 起征点（个税免征额）
     */
    @NotNull(message = "起征点不能为空")
    private BigDecimal threshold;
    
    /**
     * 税率表（JSON格式）
     * 格式示例：[{"min":0,"max":36000,"rate":0.03,"deduction":0},{"min":36000,"max":144000,"rate":0.10,"deduction":2520}]
     */
    @NotNull(message = "税率表不能为空")
    private String taxBrackets;
    
    /**
     * 专项附加扣除项目（JSON格式）
     * 格式示例：{"CHILD_EDU":1000,"CONTINUING_EDU":400,"MEDICAL":0,"HOUSING_LOAN":1000,"HOUSING_RENT":0,"ELDERLY_CARE":2000}
     */
    private String deductionItems;
    
    /**
     * 生效日期
     */
    @NotNull(message = "生效日期不能为空")
    private LocalDate effectiveDate;
}
