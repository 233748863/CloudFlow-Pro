package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 每日考勤VO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class AttendanceDailyVO {
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 员工姓名
     */
    private String employeeName;
    
    /**
     * 考勤日期
     */
    private LocalDate attendanceDate;
    
    /**
     * 班次ID
     */
    private Long shiftId;
    
    /**
     * 班次名称
     */
    private String shiftName;
    
    /**
     * 上班打卡记录
     */
    private AttendanceRecordVO checkInRecord;
    
    /**
     * 下班打卡记录
     */
    private AttendanceRecordVO checkOutRecord;
    
    /**
     * 考勤状态：NORMAL-正常 LATE-迟到 EARLY-早退 ABSENT-旷工 MISSING-缺卡
     */
    private String attendanceStatus;
    
    /**
     * 迟到分钟数
     */
    private Integer lateMinutes;
    
    /**
     * 早退分钟数
     */
    private Integer earlyMinutes;
    
    /**
     * 工作时长（分钟）
     */
    private Integer workMinutes;
}
