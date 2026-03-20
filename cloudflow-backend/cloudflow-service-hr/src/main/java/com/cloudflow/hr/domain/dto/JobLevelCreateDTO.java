package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 职级创建DTO
 * 
 * @author CloudFlow
 */
@Data
public class JobLevelCreateDTO {
    
    /**
     * 职级编码（必填，如：P1、P2、M1）
     */
    @NotBlank(message = "职级编码不能为空")
    private String levelCode;
    
    /**
     * 职级名称（必填）
     */
    @NotBlank(message = "职级名称不能为空")
    private String levelName;
    
    /**
     * 职级序列（必填，P-专业序列、M-管理序列）
     */
    @NotBlank(message = "职级序列不能为空")
    private String levelSeries;
    
    /**
     * 职级等级（必填，1-10）
     */
    @NotNull(message = "职级等级不能为空")
    private Integer levelRank;
    
    /**
     * 职级描述
     */
    private String description;
    
    /**
     * 状态：0-禁用 1-启用（默认启用）
     */
    @NotNull(message = "状态不能为空")
    private Integer status;
}
