package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 考勤打卡记录
 */
@Data
@TableName("sys_attendance_record")
public class SysAttendanceRecord {
    
    @TableId(type = IdType.AUTO)
    private Long recordId;
    
    private Long userId;
    
    /** 1签到 2签退 */
    private String type;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime checkTime;
    
    /** 经纬度 (lat,lng) */
    private String location;
    
    private String address;
    
    private String deviceInfo;
    
    private String wifiInfo;
    
    /** 1正常 2迟到 3早退 4外勤 5缺卡 */
    private String status;
    
    private String remark;
    
    private Long tenantId;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
