package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 排班规则实体类
 * 用于定义不同的工作模式和排班策略
 */
@Data
@TableName("hr_schedule_rule")
public class ScheduleRule {
    
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
     * 规则名称
     */
    private String ruleName;
    
    /**
     * 规则类型
     * FIXED - 固定班：每天固定班次
     * ROTATION - 轮班：按周期轮换班次
     * FLEXIBLE - 弹性工作制：灵活上下班时间
     * COMPREHENSIVE - 综合工时制：按周期计算总工时
     */
    private String ruleType;
    
    /**
     * 规则配置（JSON格式）
     * 存储不同规则类型的具体配置参数
     * 例如：轮班周期、弹性时间范围、综合工时周期等
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
