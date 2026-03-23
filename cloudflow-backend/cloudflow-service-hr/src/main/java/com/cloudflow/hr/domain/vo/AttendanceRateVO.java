package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 出勤率分析VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class AttendanceRateVO {

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
     * 总人数
     */
    private Integer totalEmployees;

    /**
     * 应出勤总天数
     */
    private Integer totalWorkDays;

    /**
     * 实际出勤总天数
     */
    private Integer totalActualDays;

    /**
     * 平均出勤率（百分比）
     */
    private BigDecimal averageAttendanceRate;

    /**
     * 迟到总次数
     */
    private Integer totalLateTimes;

    /**
     * 早退总次数
     */
    private Integer totalEarlyTimes;

    /**
     * 旷工总天数
     */
    private Integer totalAbsentDays;

    /**
     * 缺卡总次数
     */
    private Integer totalMissingTimes;
}
