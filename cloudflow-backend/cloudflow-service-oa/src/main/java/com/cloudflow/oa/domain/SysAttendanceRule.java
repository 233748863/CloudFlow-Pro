package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * 考勤规则
 */
@Data
@TableName("sys_attendance_rule")
public class SysAttendanceRule {
    
    @TableId(type = IdType.AUTO)
    private Long ruleId;
    
    /** 规则名称 */
    private String ruleName;
    
    /** 上班时间 HH:mm:ss */
    private String checkInTime;
    
    /** 下班时间 HH:mm:ss */
    private String checkOutTime;
    
    /** 弹性时间（分钟） */
    private Integer elasticMinutes;
    
    /** 工作日配置 JSON: [1,2,3,4,5] (1=周一...7=周日) */
    private String workDays;
    
    /** 午休开始时间 HH:mm:ss */
    private String lunchBreakStart;
    
    /** 午休结束时间 HH:mm:ss */
    private String lunchBreakEnd;
    
    /** 是否允许加班 0-否 1-是 */
    private Integer overtimeEnabled;
    
    /** 加班最低时长（分钟），低于此时长不计加班 */
    private Integer overtimeMinMinutes;
    
    /** 迟到容忍次数（每月），超过后才算迟到 */
    private Integer lateToleranceCount;
    
    /** 严重迟到阈值（分钟），超过此时长算严重迟到 */
    private Integer severeLateMinutes;
    
    /** 旷工阈值（分钟），迟到超过此时长算旷工 */
    private Integer absentMinutes;
    
    /** 是否需要拍照打卡 0-否 1-是 */
    private Integer photoRequired;
    
    /** 是否启用 0-禁用 1-启用 */
    private Integer enabled;
    
    /** 打卡地点 JSON: [{lat: 30.1, lng: 120.1, name: "总部", address: "xx路xx号"}, ...] */
    private String locationPoints;
    
    /** Wi-Fi配置 JSON: [{ssid: "Office", mac: "xx:xx"}] */
    private String wifiConfigs;
    
    /** 打卡范围半径（米） */
    private Integer radius;
    
    /** 备注说明 */
    private String remark;
    
    private Long tenantId;
    
    private String createBy;
    
    private Date createTime;
    
    private String updateBy;
    
    private Date updateTime;
}
