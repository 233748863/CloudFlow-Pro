package com.cloudflow.oa.config.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * OA模块配置属性
 * 
 * @author CloudFlow
 */
@Data
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.oa")
public class OaProperties {
    
    /**
     * 公告配置
     */
    private AnnouncementConfig announcement = new AnnouncementConfig();
    
    /**
     * 资产配置
     */
    private AssetConfig asset = new AssetConfig();
    
    /**
     * 车辆配置
     */
    private VehicleConfig vehicle = new VehicleConfig();
    
    /**
     * 考勤配置
     */
    private AttendanceConfig attendance = new AttendanceConfig();
    
    /**
     * 会议室配置
     */
    private MeetingRoomConfig meetingRoom = new MeetingRoomConfig();
    
    /**
     * 公告配置
     */
    @Data
    public static class AnnouncementConfig {
        /**
         * 默认过期天数
         */
        private Integer defaultExpireDays = 30;
        
        /**
         * 最大附件大小(MB)
         */
        private Integer maxAttachmentSize = 10;
        
        /**
         * 是否允许匿名阅读
         */
        private Boolean allowAnonymousRead = false;
    }
    
    /**
     * 资产配置
     */
    @Data
    public static class AssetConfig {
        /**
         * 是否启用二维码
         */
        private Boolean enableQrCode = true;
        
        /**
         * 二维码前缀
         */
        private String qrCodePrefix = "ASSET-";
        
        /**
         * 二维码大小
         */
        private Integer qrCodeSize = 200;
        
        /**
         * 折旧方法
         */
        private String depreciationMethod = "STRAIGHT_LINE";
    }
    
    /**
     * 车辆配置
     */
    @Data
    public static class VehicleConfig {
        /**
         * 最大预订天数
         */
        private Integer maxBookingDays = 7;
        
        /**
         * 提前预订小时数
         */
        private Integer advanceBookingHours = 2;
        
        /**
         * 是否允许并发预订
         */
        private Boolean allowConcurrentBooking = false;
        
        /**
         * 油价更新定时任务cron表达式
         */
        private String fuelPriceUpdateCron = "0 0 2 * * ?";
    }
    
    /**
     * 考勤配置
     */
    @Data
    public static class AttendanceConfig {
        /**
         * 上班时间
         */
        private String workStartTime = "09:00";
        
        /**
         * 下班时间
         */
        private String workEndTime = "18:00";
        
        /**
         * 迟到阈值(分钟)
         */
        private Integer lateThresholdMinutes = 15;
        
        /**
         * 早退阈值(分钟)
         */
        private Integer earlyLeaveThresholdMinutes = 15;
        
        /**
         * 加班阈值(分钟)
         */
        private Integer overtimeThresholdMinutes = 30;
        
        /**
         * 打卡半径(米)
         */
        private Integer checkInRadiusMeters = 500;
    }
    
    /**
     * 会议室配置
     */
    @Data
    public static class MeetingRoomConfig {
        /**
         * 最大预订小时数
         */
        private Integer maxBookingHours = 4;
        
        /**
         * 提前预订小时数
         */
        private Integer advanceBookingHours = 1;
        
        /**
         * 是否允许并发预订
         */
        private Boolean allowConcurrentBooking = false;
        
        /**
         * 自动释放分钟数
         */
        private Integer autoReleaseMinutes = 15;
    }
}
