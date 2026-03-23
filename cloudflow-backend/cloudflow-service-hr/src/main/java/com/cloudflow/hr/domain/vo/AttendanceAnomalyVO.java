package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 异常考勤VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class AttendanceAnomalyVO {

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
     * 部门名称
     */
    private String deptName;

    /**
     * 考勤日期
     */
    private LocalDate attendanceDate;

    /**
     * 异常类型：LATE-迟到 EARLY-早退 MISSING-缺卡 ABSENT-旷工
     */
    private String anomalyType;

    /**
     * 异常类型名称
     */
    private String anomalyTypeName;

    /**
     * 打卡时间
     */
    private LocalDateTime checkTime;

    /**
     * 应打卡时间
     */
    private LocalDateTime expectedTime;

    /**
     * 异常描述
     */
    private String description;
}
