package com.cloudflow.oa.config.properties;

import com.cloudflow.common.core.utils.SysConfigHelper;
import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * OA模块配置属性
 * <p>
 * 优先从 sys_config 表（通过 Redis 缓存）读取配置值，
 * 读取不到时使用 application.yml 或代码中的默认值。
 *
 * @author CloudFlow
 */
@Data
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.oa")
public class OaProperties {

    @Autowired
    private SysConfigHelper sysConfigHelper;

    /** 公告配置 */
    private AnnouncementConfig announcement = new AnnouncementConfig();

    /** 资产配置 */
    private AssetConfig asset = new AssetConfig();

    /** 车辆配置 */
    private VehicleConfig vehicle = new VehicleConfig();

    /** 考勤配置 */
    private AttendanceConfig attendance = new AttendanceConfig();

    /** 会议室配置 */
    private MeetingRoomConfig meetingRoom = new MeetingRoomConfig();

    /**
     * 初始化时从 sys_config 加载配置值，覆盖默认值
     * <p>
     * 所有 OA 配置均为租户级配置（scope=1），使用 getTenantXxx 方法读取，
     * 每个租户可以有不同的考勤时间、公告策略、车辆预订规则等。
     */
    @PostConstruct
    public void loadFromSysConfig() {
        // 考勤配置（租户级：每个租户可设置不同的上下班时间）
        attendance.setWorkStartTime(
                sysConfigHelper.getTenantValue("sys.attendance.workStartTime", attendance.getWorkStartTime()));
        attendance.setWorkEndTime(
                sysConfigHelper.getTenantValue("sys.attendance.workEndTime", attendance.getWorkEndTime()));
        attendance.setLateThresholdMinutes(
                sysConfigHelper.getTenantInt("sys.attendance.lateThreshold", attendance.getLateThresholdMinutes()));
        attendance.setEarlyLeaveThresholdMinutes(
                sysConfigHelper.getTenantInt("sys.attendance.earlyLeaveThreshold", attendance.getEarlyLeaveThresholdMinutes()));
        attendance.setOvertimeThresholdMinutes(
                sysConfigHelper.getTenantInt("sys.attendance.overtimeThreshold", attendance.getOvertimeThresholdMinutes()));
        attendance.setCheckInRadiusMeters(
                sysConfigHelper.getTenantInt("sys.attendance.checkInRadius", attendance.getCheckInRadiusMeters()));

        // 公告配置（租户级）
        announcement.setDefaultExpireDays(
                sysConfigHelper.getTenantInt("sys.announcement.defaultExpireDays", announcement.getDefaultExpireDays()));
        announcement.setMaxAttachmentSize(
                sysConfigHelper.getTenantInt("sys.announcement.maxAttachmentSize", announcement.getMaxAttachmentSize()));

        // 车辆配置（租户级）
        vehicle.setMaxBookingDays(
                sysConfigHelper.getTenantInt("sys.vehicle.maxBookingDays", vehicle.getMaxBookingDays()));
        vehicle.setAdvanceBookingHours(
                sysConfigHelper.getTenantInt("sys.vehicle.advanceBookingHours", vehicle.getAdvanceBookingHours()));

        // 会议室配置（租户级）
        meetingRoom.setMaxBookingHours(
                sysConfigHelper.getTenantInt("sys.meetingRoom.maxBookingHours", meetingRoom.getMaxBookingHours()));
        meetingRoom.setAutoReleaseMinutes(
                sysConfigHelper.getTenantInt("sys.meetingRoom.autoReleaseMinutes", meetingRoom.getAutoReleaseMinutes()));

        // 公告补充配置（租户级，ID 55）
        announcement.setAllowAnonymousRead(
                sysConfigHelper.getTenantBoolean("sys.announcement.allowAnonymousRead", announcement.getAllowAnonymousRead()));

        // 资产配置（租户级）
        asset.setQrCodePrefix(
                sysConfigHelper.getTenantValue("sys.asset.qrCodePrefix", asset.getQrCodePrefix()));
        asset.setDepreciationMethod(
                sysConfigHelper.getTenantValue("sys.asset.depreciationMethod", asset.getDepreciationMethod()));
        // 资产补充配置（租户级，ID 56-57）
        asset.setEnableQrCode(
                sysConfigHelper.getTenantBoolean("sys.asset.enableQrCode", asset.getEnableQrCode()));
        asset.setQrCodeSize(
                sysConfigHelper.getTenantInt("sys.asset.qrCodeSize", asset.getQrCodeSize()));

        // 车辆补充配置（租户级，ID 58-59）
        vehicle.setAllowConcurrentBooking(
                sysConfigHelper.getTenantBoolean("sys.vehicle.allowConcurrentBooking", vehicle.getAllowConcurrentBooking()));
        vehicle.setFuelPriceUpdateCron(
                sysConfigHelper.getTenantValue("sys.vehicle.fuelPriceUpdateCron", vehicle.getFuelPriceUpdateCron()));

        // 会议室补充配置（租户级，ID 60-61）
        meetingRoom.setAdvanceBookingHours(
                sysConfigHelper.getTenantInt("sys.meetingRoom.advanceBookingHours", meetingRoom.getAdvanceBookingHours()));
        meetingRoom.setAllowConcurrentBooking(
                sysConfigHelper.getTenantBoolean("sys.meetingRoom.allowConcurrentBooking", meetingRoom.getAllowConcurrentBooking()));
    }

    /** 公告配置 */
    @Data
    public static class AnnouncementConfig {
        /** 默认过期天数 */
        private Integer defaultExpireDays = 30;
        /** 最大附件大小(MB) */
        private Integer maxAttachmentSize = 10;
        /** 是否允许匿名阅读 */
        private Boolean allowAnonymousRead = false;
    }

    /** 资产配置 */
    @Data
    public static class AssetConfig {
        /** 是否启用二维码 */
        private Boolean enableQrCode = true;
        /** 二维码前缀 */
        private String qrCodePrefix = "ASSET-";
        /** 二维码大小 */
        private Integer qrCodeSize = 200;
        /** 折旧方法 */
        private String depreciationMethod = "STRAIGHT_LINE";
    }

    /** 车辆配置 */
    @Data
    public static class VehicleConfig {
        /** 最大预订天数 */
        private Integer maxBookingDays = 7;
        /** 提前预订小时数 */
        private Integer advanceBookingHours = 2;
        /** 是否允许并发预订 */
        private Boolean allowConcurrentBooking = false;
        /** 油价更新定时任务cron表达式 */
        private String fuelPriceUpdateCron = "0 0 2 * * ?";
    }

    /** 考勤配置 */
    @Data
    public static class AttendanceConfig {
        /** 上班时间 */
        private String workStartTime = "09:00";
        /** 下班时间 */
        private String workEndTime = "18:00";
        /** 迟到阈值(分钟) */
        private Integer lateThresholdMinutes = 15;
        /** 早退阈值(分钟) */
        private Integer earlyLeaveThresholdMinutes = 15;
        /** 加班阈值(分钟) */
        private Integer overtimeThresholdMinutes = 30;
        /** 打卡半径(米) */
        private Integer checkInRadiusMeters = 500;
    }

    /** 会议室配置 */
    @Data
    public static class MeetingRoomConfig {
        /** 最大预订小时数 */
        private Integer maxBookingHours = 4;
        /** 提前预订小时数 */
        private Integer advanceBookingHours = 1;
        /** 是否允许并发预订 */
        private Boolean allowConcurrentBooking = false;
        /** 自动释放分钟数 */
        private Integer autoReleaseMinutes = 15;
    }
}
