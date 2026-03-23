package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 加班统计VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OvertimeStatisticsVO {

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
     * 统计年份
     */
    private Integer year;

    /**
     * 统计月份
     */
    private Integer month;

    /**
     * 工作日加班时长（小时）
     */
    private BigDecimal workdayHours;

    /**
     * 周末加班时长（小时）
     */
    private BigDecimal weekendHours;

    /**
     * 节假日加班时长（小时）
     */
    private BigDecimal holidayHours;

    /**
     * 总加班时长（小时）
     */
    private BigDecimal totalHours;

    /**
     * 转调休时长（小时）
     */
    private BigDecimal timeOffHours;

    /**
     * 转加班费时长（小时）
     */
    private BigDecimal paymentHours;

    /**
     * 加班次数
     */
    private Integer overtimeCount;
}
