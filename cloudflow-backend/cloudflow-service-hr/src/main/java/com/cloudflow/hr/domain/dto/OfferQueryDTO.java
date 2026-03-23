package com.cloudflow.hr.domain.dto;

import lombok.Data;

/**
 * Offer查询DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OfferQueryDTO {
    
    /**
     * 候选人ID
     */
    private Long candidateId;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 职位ID
     */
    private Long positionId;
    
    /**
     * 状态
     */
    private String status;
    
    /**
     * 页码
     */
    private Integer pageNum = 1;
    
    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}
