package com.cloudflow.oa.config.properties;

import com.cloudflow.common.redis.config.SysConfigKeys;
import com.cloudflow.common.redis.core.SysConfigHelper;
import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * OA 模块配置属性。
 *
 * <p>优先从 sys_config 读取租户级配置，未配置时回退到代码默认值。</p>
 */
@Data
@Component
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
                sysConfigHelper.getTenantInt(SysConfigKeys.ANNOUNCEMENT_DEFAULT_EXPIRE_DAYS, announcement.getDefaultExpireDays()));
        announcement.setMaxAttachmentSize(
                sysConfigHelper.getTenantInt(SysConfigKeys.ANNOUNCEMENT_MAX_ATTACHMENT_SIZE, announcement.getMaxAttachmentSize()));
        announcement.setAllowAnonymousRead(
                sysConfigHelper.getTenantBoolean(SysConfigKeys.ANNOUNCEMENT_ALLOW_ANONYMOUS, announcement.getAllowAnonymousRead()));

        asset.setQrCodePrefix(
                sysConfigHelper.getTenantValue(SysConfigKeys.ASSET_QR_CODE_PREFIX, asset.getQrCodePrefix()));
        asset.setDepreciationMethod(
                sysConfigHelper.getTenantValue(SysConfigKeys.ASSET_DEPRECIATION_METHOD, asset.getDepreciationMethod()));
        asset.setEnableQrCode(
                sysConfigHelper.getTenantBoolean(SysConfigKeys.ASSET_ENABLE_QR_CODE, asset.getEnableQrCode()));
        asset.setQrCodeSize(
                sysConfigHelper.getTenantInt(SysConfigKeys.ASSET_QR_CODE_SIZE, asset.getQrCodeSize()));

        vehicle.setMaxBookingDays(
                sysConfigHelper.getTenantInt(SysConfigKeys.VEHICLE_MAX_BOOKING_DAYS, vehicle.getMaxBookingDays()));
        vehicle.setAdvanceBookingHours(
                sysConfigHelper.getTenantInt(SysConfigKeys.VEHICLE_ADVANCE_BOOKING_HOURS, vehicle.getAdvanceBookingHours()));
        vehicle.setAllowConcurrentBooking(
                sysConfigHelper.getTenantBoolean(SysConfigKeys.VEHICLE_ALLOW_CONCURRENT, vehicle.getAllowConcurrentBooking()));
        vehicle.setFuelPriceUpdateCron(
                sysConfigHelper.getTenantValue(SysConfigKeys.VEHICLE_FUEL_PRICE_UPDATE_CRON, vehicle.getFuelPriceUpdateCron()));

        meetingRoom.setMaxBookingHours(
                sysConfigHelper.getTenantInt(SysConfigKeys.MEETING_ROOM_MAX_BOOKING_HOURS, meetingRoom.getMaxBookingHours()));
        meetingRoom.setAutoReleaseMinutes(
                sysConfigHelper.getTenantInt(SysConfigKeys.MEETING_ROOM_AUTO_RELEASE_MINUTES, meetingRoom.getAutoReleaseMinutes()));
        meetingRoom.setAdvanceBookingHours(
                sysConfigHelper.getTenantInt(SysConfigKeys.MEETING_ROOM_ADVANCE_BOOKING_HOURS, meetingRoom.getAdvanceBookingHours()));
        meetingRoom.setAllowConcurrentBooking(
                sysConfigHelper.getTenantBoolean(SysConfigKeys.MEETING_ROOM_ALLOW_CONCURRENT, meetingRoom.getAllowConcurrentBooking()));

        errorReport.setEnabled(
                sysConfigHelper.getTenantBoolean(SysConfigKeys.ERROR_REPORT_ENABLED, errorReport.getEnabled()));
        errorReport.setAllowAnonymousPath(
                sysConfigHelper.getTenantValue(SysConfigKeys.ERROR_REPORT_ALLOW_ANONYMOUS_PATH, errorReport.getAllowAnonymousPath()));

        sync.setConflictStrategy(
                sysConfigHelper.getTenantValue(SysConfigKeys.SYNC_CONFLICT_STRATEGY, sync.getConflictStrategy()));
        sync.setTimeToleranceSeconds(
                sysConfigHelper.getTenantInt(SysConfigKeys.SYNC_TIME_TOLERANCE_SECONDS, sync.getTimeToleranceSeconds()));
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
