package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 考勤月报VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class AttendanceMonthlyVO {

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 员工姓名
     */
    private String employeeName;

    /**
     * 员工工号
     */
    private String employeeNo;

    /**
     * 部门ID
     */
    private Long deptId;

    /**
     * 部门名称
     */
    private String deptName;

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
     * 状态名称
     */
    private String statusName;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
