package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 职级实体类
 * 用于定义职位的等级体系，如P1-P10（专业序列）、M1-M5（管理序列）
 * 
 * @author CloudFlow
 */
@Data
@TableName("hr_job_level")
public class JobLevel {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID（多租户隔离）
     */
    private Long tenantId;
    
    /**
     * 职级编码（如：P1、P2、M1等）
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
     * 职级等级（1-10，数字越大等级越高）
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
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
