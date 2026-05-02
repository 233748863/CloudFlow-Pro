package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 打卡记录实体类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
@TableName("hr_attendance_record")
public class AttendanceRecord {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
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
     * 考勤日期
     */
    private LocalDate attendanceDate;

    /**
     * 生效规则ID
     */
    private Long ruleId;
    
    /**
     * 班次ID
     */
    private Long shiftId;
    
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
     * 打卡位置（GPS坐标或WiFi SSID）
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
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
    
    /**
     * 创建人
     */
    @TableField(fill = FieldFill.INSERT)
    private Long createBy;
    
    /**
     * 更新人
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updateBy;
    
    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}
