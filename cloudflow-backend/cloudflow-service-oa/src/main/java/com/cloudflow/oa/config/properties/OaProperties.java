package com.cloudflow.oa.config.properties;

import com.cloudflow.common.redis.core.SysConfigHelper;
import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * OA 模块配置属性。
 *
 * <p>优先从 sys_config 读取租户级配置，未配置时回退到代码默认值。</p>
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

    /** 会议室配置 */
    private MeetingRoomConfig meetingRoom = new MeetingRoomConfig();

    /** 错误上报配置 */
    private ErrorReportConfig errorReport = new ErrorReportConfig();

    /** 离线同步配置 */
    private SyncConfig sync = new SyncConfig();

    @PostConstruct
    public void loadFromSysConfig() {
        announcement.setDefaultExpireDays(
                sysConfigHelper.getTenantInt("sys.announcement.defaultExpireDays", announcement.getDefaultExpireDays()));
        announcement.setMaxAttachmentSize(
                sysConfigHelper.getTenantInt("sys.announcement.maxAttachmentSize", announcement.getMaxAttachmentSize()));
        announcement.setAllowAnonymousRead(
                sysConfigHelper.getTenantBoolean("sys.announcement.allowAnonymous", announcement.getAllowAnonymousRead()));

        asset.setQrCodePrefix(
                sysConfigHelper.getTenantValue("sys.asset.qrCodePrefix", asset.getQrCodePrefix()));
        asset.setDepreciationMethod(
                sysConfigHelper.getTenantValue("sys.asset.depreciationMethod", asset.getDepreciationMethod()));
        asset.setEnableQrCode(
                sysConfigHelper.getTenantBoolean("sys.asset.enableQrCode", asset.getEnableQrCode()));
        asset.setQrCodeSize(
                sysConfigHelper.getTenantInt("sys.asset.qrCodeSize", asset.getQrCodeSize()));

        vehicle.setMaxBookingDays(
                sysConfigHelper.getTenantInt("sys.vehicle.maxBookingDays", vehicle.getMaxBookingDays()));
        vehicle.setAdvanceBookingHours(
                sysConfigHelper.getTenantInt("sys.vehicle.advanceBookingHours", vehicle.getAdvanceBookingHours()));
        vehicle.setAllowConcurrentBooking(
                sysConfigHelper.getTenantBoolean("sys.vehicle.allowConcurrent", vehicle.getAllowConcurrentBooking()));
        vehicle.setFuelPriceUpdateCron(
                sysConfigHelper.getTenantValue("sys.vehicle.fuelPriceUpdateCron", vehicle.getFuelPriceUpdateCron()));

        meetingRoom.setMaxBookingHours(
                sysConfigHelper.getTenantInt("sys.meetingRoom.maxBookingHours", meetingRoom.getMaxBookingHours()));
        meetingRoom.setAutoReleaseMinutes(
                sysConfigHelper.getTenantInt("sys.meetingRoom.autoReleaseMinutes", meetingRoom.getAutoReleaseMinutes()));
        meetingRoom.setAdvanceBookingHours(
                sysConfigHelper.getTenantInt("sys.meetingRoom.advanceBookingHours", meetingRoom.getAdvanceBookingHours()));
        meetingRoom.setAllowConcurrentBooking(
                sysConfigHelper.getTenantBoolean("sys.meetingRoom.allowConcurrent", meetingRoom.getAllowConcurrentBooking()));

        errorReport.setEnabled(
                sysConfigHelper.getTenantBoolean("sys.errorReport.enabled", errorReport.getEnabled()));
        errorReport.setAllowAnonymousPath(
                sysConfigHelper.getTenantValue("sys.errorReport.allowAnonymousPath", errorReport.getAllowAnonymousPath()));
        errorReport.setIpLimitCount(
                sysConfigHelper.getTenantInt("sys.errorReport.ipLimitCount", errorReport.getIpLimitCount()));
        errorReport.setIpLimitWindowSeconds(
                sysConfigHelper.getTenantInt("sys.errorReport.ipLimitWindowSeconds", errorReport.getIpLimitWindowSeconds()));

        sync.setConflictStrategy(
                sysConfigHelper.getTenantValue("sys.sync.conflictStrategy", sync.getConflictStrategy()));
        sync.setTimeToleranceSeconds(
                sysConfigHelper.getTenantInt("sys.sync.timeToleranceSeconds", sync.getTimeToleranceSeconds()));
    }

    public AnnouncementConfig getAnnouncement() {
        loadFromSysConfig();
        return announcement;
    }

    public AssetConfig getAsset() {
        loadFromSysConfig();
        return asset;
    }

    public VehicleConfig getVehicle() {
        loadFromSysConfig();
        return vehicle;
    }

    public MeetingRoomConfig getMeetingRoom() {
        loadFromSysConfig();
        return meetingRoom;
    }

    public ErrorReportConfig getErrorReport() {
        loadFromSysConfig();
        return errorReport;
    }

    public SyncConfig getSync() {
        loadFromSysConfig();
        return sync;
    }

    @Data
    public static class AnnouncementConfig {
        /** 默认过期天数 */
        private Integer defaultExpireDays = 30;

        /** 最大附件大小，单位 MB */
        private Integer maxAttachmentSize = 10;

        /** 是否允许匿名阅读 */
        private Boolean allowAnonymousRead = false;
    }

    @Data
    public static class AssetConfig {
        /** 是否启用二维码 */
        private Boolean enableQrCode = true;

        /** 二维码前缀 */
        private String qrCodePrefix = "ASSET-";

        /** 二维码大小 */
        private Integer qrCodeSize = 200;

        /** 折旧方式 */
        private String depreciationMethod = "STRAIGHT_LINE";
    }

    @Data
    public static class VehicleConfig {
        /** 最大预约天数 */
        private Integer maxBookingDays = 7;

        /** 提前预约小时数 */
        private Integer advanceBookingHours = 2;

        /** 是否允许并发预约 */
        private Boolean allowConcurrentBooking = false;

        /** 油价更新 cron 表达式 */
        private String fuelPriceUpdateCron = "0 0 2 * * ?";
    }

    @Data
    public static class ErrorReportConfig {
        /** 是否启用前端错误上报 */
        private Boolean enabled = true;

        /** 允许上报的前端路径前缀 */
        private String allowAnonymousPath = "/dashboard";

        /** IP 限流窗口内最大请求数 */
        private Integer ipLimitCount = 20;

        /** IP 限流窗口时长，单位秒 */
        private Integer ipLimitWindowSeconds = 60;
    }

    @Data
    public static class MeetingRoomConfig {
        /** 最大预约小时数 */
        private Integer maxBookingHours = 4;

        /** 提前预约小时数 */
        private Integer advanceBookingHours = 1;

        /** 是否允许并发预约 */
        private Boolean allowConcurrentBooking = false;

        /** 自动释放分钟数 */
        private Integer autoReleaseMinutes = 15;
    }

    @Data
    public static class SyncConfig {
        /** 冲突策略 */
        private String conflictStrategy = "LAST_WRITE_WINS";

        /** 时间容差，单位秒 */
        private Integer timeToleranceSeconds = 5;
    }
}
