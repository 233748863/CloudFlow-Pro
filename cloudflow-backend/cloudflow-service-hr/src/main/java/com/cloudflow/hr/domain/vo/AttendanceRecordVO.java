package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 打卡记录VO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class AttendanceRecordVO {
    
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
     * 部门名称
     */
    private String deptName;
    
    /**
     * 考勤日期
     */
    private LocalDate attendanceDate;

    /**
     * 生效规则ID
     */
    private Long ruleId;

    /**
     * 生效规则名称
     */
    private String ruleName;
    
    /**
     * 班次ID
     */
    private Long shiftId;
    
    /**
     * 班次名称
     */
    private String shiftName;
    
    /**
     * 打卡类型：CHECK_IN-上班打卡 CHECK_OUT-下班打卡
     */
    private String checkType;
    
    /**
     * 打卡时间
     */
    private LocalDateTime checkTime;

    /**
     * 规则期望打卡时间
     */
    private LocalDateTime expectedTime;

    /**
     * 偏差分钟数
     */
    private Integer deviationMinutes;
    
    /**
     * 打卡方式：GPS-定位打卡 WIFI-WiFi打卡 FACE-人脸识别
     */
    private String checkMethod;
    
    /**
     * 打卡位置
     */
    private String location;
    
    /**
     * 状态：NORMAL-正常 LATE-迟到 SEVERE_LATE-严重迟到 EARLY-早退 ABSENT-旷工 MISSING-缺卡 SUPPLEMENT-补卡
     */
    private String status;
    
    /**
     * 补卡流程实例ID
     */
    private String processInstanceId;
    
    /**
     * 备注
     */
    private String remark;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}
