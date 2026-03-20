package com.cloudflow.hr.domain.dto;

import lombok.Data;

/**
 * 职位查询DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class PositionQueryDTO {
    
    /**
     * 职位编码（模糊查询）
     */
    private String positionCode;
    
    /**
     * 职位名称（模糊查询）
     */
    private String positionName;
    
    /**
     * 职位族ID
     */
    private Long familyId;
    
    /**
     * 职级ID
     */
    private Long levelId;
    
    /**
     * 岗位ID
     */
    private Long postId;
    
    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
}
