package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 调薪历史VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class SalaryAdjustmentHistoryVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 申请编号
     */
    private String applicationNo;
    
    /**
     * 调薪类型：PROMOTION-晋升调薪 ANNUAL-年度调薪 PERFORMANCE-绩效调薪 MARKET-市场调薪
     */
    private String adjustmentType;
    
    /**
     * 调薪原因
     */
    private String adjustmentReason;
    
    /**
     * 调薪前总额
     */
    private BigDecimal beforeTotal;
    
    /**
     * 调薪后总额
     */
    private BigDecimal afterTotal;
    
    /**
     * 调薪金额
     */
    private BigDecimal adjustmentAmount;
    
    /**
     * 调薪比例（百分比）
     */
    private BigDecimal adjustmentRate;
    
    /**
     * 生效日期
     */
    private LocalDate effectiveDate;
    
    /**
     * 状态
     */
    private String status;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}
