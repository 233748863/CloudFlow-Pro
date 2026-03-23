package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 排班规则视图对象
 */
@Data
public class ScheduleRuleVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 规则名称
     */
    private String ruleName;
    
    /**
     * 规则类型
     * FIXED - 固定班
     * ROTATION - 轮班
     * FLEXIBLE - 弹性工作制
     * COMPREHENSIVE - 综合工时制
     */
    private String ruleType;
    
    /**
     * 规则类型描述
     */
    private String ruleTypeDesc;
    
    /**
     * 规则配置（JSON格式）
     */
    private String ruleConfig;
    
    /**
     * 规则描述
     */
    private String description;
    
    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
    
    /**
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
