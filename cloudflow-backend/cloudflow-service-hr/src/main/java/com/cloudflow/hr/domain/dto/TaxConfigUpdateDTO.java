package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 个税配置更新DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class TaxConfigUpdateDTO {
    
    /**
     * 起征点（个税免征额）
     */
    private BigDecimal threshold;
    
    /**
     * 税率表（JSON格式）
     */
    private String taxBrackets;
    
    /**
     * 专项附加扣除项目（JSON格式）
     */
    private String deductionItems;
    
    /**
     * 生效日期
     */
    private LocalDate effectiveDate;
    
    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
}
