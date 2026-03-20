package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 职位VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class PositionVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 职位编码
     */
    private String positionCode;
    
    /**
     * 职位名称
     */
    private String positionName;
    
    /**
     * 职位族ID
     */
    private Long familyId;
    
    /**
     * 职位族名称
     */
    private String familyName;
    
    /**
     * 职级ID
     */
    private Long levelId;
    
    /**
     * 职级名称
     */
    private String levelName;
    
    /**
     * 岗位ID
     */
    private Long postId;
    
    /**
     * 岗位名称
     */
    private String postName;
    
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
