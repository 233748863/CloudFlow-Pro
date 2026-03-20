package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 职级更新DTO
 * 
 * @author CloudFlow
 */
@Data
public class JobLevelUpdateDTO {
    
    /**
     * 职级编码
     */
    @NotBlank(message = "职级编码不能为空")
    private String levelCode;
    
    /**
     * 职级名称
     */
    @NotBlank(message = "职级名称不能为空")
    private String levelName;
    
    /**
     * 职级序列（P-专业序列、M-管理序列）
     */
    @NotBlank(message = "职级序列不能为空")
    private String levelSeries;
    
    /**
     * 职级等级（1-10）
     */
    @NotNull(message = "职级等级不能为空")
    private Integer levelRank;
    
    /**
     * 职级描述
     */
    private String description;
    
    /**
     * 状态：0-禁用 1-启用
     */
    @NotNull(message = "状态不能为空")
    private Integer status;
}
