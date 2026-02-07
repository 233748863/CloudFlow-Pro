package com.cloudflow.workflow.domain;

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
    
    private String ruleName;
    
    private String checkInTime;
    
    private String checkOutTime;
    
    private Integer elasticMinutes;
    
    /** JSON: [{lat: 30.1, lng: 120.1}, ...] */
    private String locationPoints;
    
    /** JSON: [{ssid: "Office", mac: "xx:xx"}] */
    private String wifiConfigs;
    
    private Integer radius;
    
    private Long tenantId;
    
    private String createBy;
    
    private Date createTime;
}
