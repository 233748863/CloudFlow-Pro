package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;

/**
 * 排班规则更新DTO
 */
@Data
public class ScheduleRuleUpdateDTO {
    
    /**
     * 规则名称
     */
    @NotBlank(message = "规则名称不能为空")
    private String ruleName;
    
    /**
     * 规则类型
     * FIXED - 固定班
     * ROTATION - 轮班
     * FLEXIBLE - 弹性工作制
     * COMPREHENSIVE - 综合工时制
     */
    @NotBlank(message = "规则类型不能为空")
    private String ruleType;
    
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
}
