package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalTime;

/**
 * 班次更新DTO
 */
@Data
public class ShiftUpdateDTO {
    
    /**
     * 班次名称
     */
    @NotBlank(message = "班次名称不能为空")
    private String shiftName;
    
    /**
     * 上班时间
     */
    @NotNull(message = "上班时间不能为空")
    private LocalTime startTime;
    
    /**
     * 下班时间
     */
    @NotNull(message = "下班时间不能为空")
    private LocalTime endTime;
    
    /**
     * 休息时长（分钟）
     */
    private Integer breakMinutes;
    
    /**
     * 迟到阈值（分钟）
     */
    private Integer lateThreshold;
    
    /**
     * 早退阈值（分钟）
     */
    private Integer earlyThreshold;
    
    /**
     * 显示颜色
     */
    private String color;
    
    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
}
