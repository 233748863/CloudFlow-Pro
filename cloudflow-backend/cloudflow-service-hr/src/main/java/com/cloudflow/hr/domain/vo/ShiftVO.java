package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 班次视图对象
 */
@Data
public class ShiftVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 班次编码
     */
    private String shiftCode;
    
    /**
     * 班次名称
     */
    private String shiftName;
    
    /**
     * 上班时间
     */
    private LocalTime startTime;
    
    /**
     * 下班时间
     */
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
     * 工作时长（分钟）
     */
    private Integer workMinutes;
    
    /**
     * 显示颜色
     */
    private String color;
    
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
