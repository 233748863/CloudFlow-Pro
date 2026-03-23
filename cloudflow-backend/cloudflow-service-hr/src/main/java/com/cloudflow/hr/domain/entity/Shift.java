package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 班次实体类
 * 用于定义考勤排班的时间段配置
 */
@Data
@TableName("hr_shift")
public class Shift {
    
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
     * 班次编码（唯一标识）
     */
    private String shiftCode;
    
    /**
     * 班次名称（如：早班、中班、晚班）
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
     * 超过此时间打卡视为迟到
     */
    private Integer lateThreshold;
    
    /**
     * 早退阈值（分钟）
     * 提前此时间打卡视为早退
     */
    private Integer earlyThreshold;
    
    /**
     * 工作时长（分钟）
     * 计算方式：下班时间 - 上班时间 - 休息时长
     */
    private Integer workMinutes;
    
    /**
     * 显示颜色（用于前端日历展示）
     */
    private String color;
    
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
