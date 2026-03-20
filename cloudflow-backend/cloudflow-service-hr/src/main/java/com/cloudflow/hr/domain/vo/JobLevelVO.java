package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 职级VO
 * 
 * @author CloudFlow
 */
@Data
public class JobLevelVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 职级编码
     */
    private String levelCode;
    
    /**
     * 职级名称
     */
    private String levelName;
    
    /**
     * 职级序列（P-专业序列、M-管理序列）
     */
    private String levelSeries;
    
    /**
     * 职级等级（1-10）
     */
    private Integer levelRank;
    
    /**
     * 职级描述
     */
    private String description;
    
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
