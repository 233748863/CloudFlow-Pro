package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 个税计算结果VO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class TaxCalculationVO {
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 应税收入（扣除五险一金后的收入）
     */
    private BigDecimal taxableIncome;
    
    /**
     * 起征点
     */
    private BigDecimal threshold;
    
    /**
     * 专项附加扣除总额
     */
    private BigDecimal totalDeduction;
    
    /**
     * 专项附加扣除明细
     */
    private List<DeductionDetail> deductionDetails;
    
    /**
     * 应纳税所得额（应税收入 - 起征点 - 专项附加扣除）
     */
    private BigDecimal taxableAmount;
    
    /**
     * 适用税率
     */
    private BigDecimal taxRate;
    
    /**
     * 速算扣除数
     */
    private BigDecimal quickDeduction;
    
    /**
     * 应纳税额（应纳税所得额 * 税率 - 速算扣除数）
     */
    private BigDecimal taxAmount;
    
    /**
     * 税后收入（应税收入 - 应纳税额）
     */
    private BigDecimal afterTaxIncome;
    
    /**
     * 专项扣除明细
     */
    @Data
    public static class DeductionDetail {
        /**
         * 扣除类型
         */
        private String deductionType;
        
        /**
         * 扣除类型名称
         */
        private String deductionTypeName;
        
        /**
         * 扣除金额
         */
        private BigDecimal amount;
    }
}
