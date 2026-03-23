package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 创建Offer DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OfferCreateDTO {
    
    /**
     * 候选人ID
     */
    @NotNull(message = "候选人ID不能为空")
    private Long candidateId;
    
    /**
     * 部门ID
     */
    @NotNull(message = "部门ID不能为空")
    private Long deptId;
    
    /**
     * 职位ID
     */
    @NotNull(message = "职位ID不能为空")
    private Long positionId;
    
    /**
     * 薪资
     */
    @NotNull(message = "薪资不能为空")
    private BigDecimal salary;
    
    /**
     * 期望入职日期
     */
    @NotNull(message = "期望入职日期不能为空")
    private LocalDate expectedDate;
    
    /**
     * Offer有效期
     */
    @NotNull(message = "Offer有效期不能为空")
    private LocalDate expiryDate;
    
    /**
     * Offer内容
     */
    private String offerContent;
}
