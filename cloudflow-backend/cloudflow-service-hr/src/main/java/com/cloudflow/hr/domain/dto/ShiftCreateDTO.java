package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalTime;

/**
 * 班次创建DTO
 */
@Data
public class ShiftCreateDTO {
    
    /**
     * 班次编码（唯一标识）
     */
    @NotBlank(message = "班次编码不能为空")
    private String shiftCode;
    
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
}
