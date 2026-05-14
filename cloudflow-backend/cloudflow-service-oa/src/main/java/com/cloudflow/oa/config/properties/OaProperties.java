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

    @PostConstruct
    public void loadFromSysConfig() {
        announcement.setDefaultExpireDays(
                sysConfigHelper.getTenantInt("sys.announcement.defaultExpireDays", announcement.getDefaultExpireDays()));
        announcement.setMaxAttachmentSize(
                sysConfigHelper.getTenantInt("sys.announcement.maxAttachmentSize", announcement.getMaxAttachmentSize()));
        announcement.setAllowAnonymousRead(
                sysConfigHelper.getTenantBoolean("sys.announcement.allowAnonymousRead", announcement.getAllowAnonymousRead()));

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
                sysConfigHelper.getTenantBoolean("sys.vehicle.allowConcurrentBooking", vehicle.getAllowConcurrentBooking()));
        vehicle.setFuelPriceUpdateCron(
                sysConfigHelper.getTenantValue("sys.vehicle.fuelPriceUpdateCron", vehicle.getFuelPriceUpdateCron()));

        meetingRoom.setMaxBookingHours(
                sysConfigHelper.getTenantInt("sys.meetingRoom.maxBookingHours", meetingRoom.getMaxBookingHours()));
        meetingRoom.setAutoReleaseMinutes(
                sysConfigHelper.getTenantInt("sys.meetingRoom.autoReleaseMinutes", meetingRoom.getAutoReleaseMinutes()));
        meetingRoom.setAdvanceBookingHours(
                sysConfigHelper.getTenantInt("sys.meetingRoom.advanceBookingHours", meetingRoom.getAdvanceBookingHours()));
        meetingRoom.setAllowConcurrentBooking(
                sysConfigHelper.getTenantBoolean("sys.meetingRoom.allowConcurrentBooking", meetingRoom.getAllowConcurrentBooking()));
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
}
