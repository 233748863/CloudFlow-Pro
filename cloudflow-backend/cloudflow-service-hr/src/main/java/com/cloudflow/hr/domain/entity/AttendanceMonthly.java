package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 考勤月报实体类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_attendance_monthly")
public class AttendanceMonthly {

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 年份
     */
    private Integer year;

    /**
     * 月份
     */
    private Integer month;

    /**
     * 应出勤天数
     */
    private Integer workDays;

    /**
     * 实际出勤天数
     */
    private Integer actualDays;

    /**
     * 迟到次数
     */
    private Integer lateTimes;

    /**
     * 早退次数
     */
    private Integer earlyTimes;

    /**
     * 旷工天数
     */
    private Integer absentDays;

    /**
     * 缺卡次数
     */
    private Integer missingTimes;

    /**
     * 请假天数
     */
    private BigDecimal leaveDays;

    /**
     * 加班时长（小时）
     */
    private BigDecimal overtimeHours;

    /**
     * 出勤率（百分比）
     */
    private BigDecimal attendanceRate;

    /**
     * 状态：DRAFT-草稿 CONFIRMED-已确认
     */
    private String status;

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

    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}
