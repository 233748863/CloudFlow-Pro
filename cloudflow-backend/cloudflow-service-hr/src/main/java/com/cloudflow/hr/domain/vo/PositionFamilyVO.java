package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 职位族VO
 * 
 * @author CloudFlow
 */
@Data
public class PositionFamilyVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 职位族编码
     */
    private String familyCode;
    
    /**
     * 职位族名称
     */
    private String familyName;
    
    /**
     * 职位族描述
     */
    private String description;
    
    /**
     * 排序号
     */
    private Integer sortOrder;
    
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
