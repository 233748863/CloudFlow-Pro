package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 打卡请求DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class AttendanceCheckDTO {
    
    /**
     * 员工ID（可选，如果不传则从当前登录用户获取）
     */
    private Long employeeId;
    
    /**
     * 打卡类型：CHECK_IN-上班打卡 CHECK_OUT-下班打卡
     */
    private String checkType;
    
    /**
     * 打卡方式：GPS-定位打卡 WIFI-WiFi打卡 FACE-人脸识别
     */
    @NotBlank(message = "打卡方式不能为空")
    private String checkMethod;
    
    /**
     * 打卡位置（GPS坐标或WiFi SSID）
     */
    private String location;
    
    /**
     * GPS纬度
     */
    private Double latitude;
    
    /**
     * GPS经度
     */
    private Double longitude;
    
    /**
     * WiFi SSID
     */
    private String wifiSsid;
    
    /**
     * 人脸识别token
     */
    private String faceToken;
    
    /**
     * 备注
     */
    private String remark;
}
