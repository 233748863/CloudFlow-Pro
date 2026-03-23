package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 个税配置VO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class TaxConfigVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
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
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
