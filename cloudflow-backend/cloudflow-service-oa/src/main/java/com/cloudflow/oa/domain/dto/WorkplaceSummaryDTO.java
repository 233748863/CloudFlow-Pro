package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * 工作台概览 DTO
 */
@Data
public class WorkplaceSummaryDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 用户信息
     */
    private UserInfo user;
    
    /**
     * 统计数据
     */
    private Statistics statistics;

    /**
     * 工作台 2.0 统计。
     */
    private Stats stats;
    
    /**
     * 快捷操作
     */
    private List<QuickAction> quickActions;
    
    /**
     * 最新公告（最多3条）
     */
    private List<AnnouncementItem> announcements;

    /**
     * 今日事项。
     */
    private List<TodayItem> todayItems;

    /**
     * 风险提醒。
     */
    private List<RiskItem> riskItems;

    /**
     * 最近动态。
     */
    private List<ActivityItem> recentActivities;

    /**
     * 聚合服务健康状态。
     */
    private Map<String, ServiceStatus> serviceHealth;
    
    /**
     * 用户信息
     */
    @Data
    public static class UserInfo {
        private String name;
        private String department;
        private String avatar;
    }
    
    /**
     * 统计数据
     */
    @Data
    public static class Statistics {
        /**
         * 待办任务数量
         */
        private Integer pendingTasks;
        
        /**
         * 今日日程数量
         */
        private Integer todaySchedules;
        
        /**
         * 未读消息数量
         */
        private Integer unreadMessages;
    }

    /**
     * 工作台 2.0 统计。
     */
    @Data
    public static class Stats {
        private Integer pendingTasks;
        private Integer todaySchedules;
        private Integer unreadMessages;
        private Integer unreadAnnouncements;
        private Integer openRisks;
        private Integer recentActivities;
    }
    
    /**
     * 快捷操作
     */
    @Data
    public static class QuickAction {
        private String id;
        private String name;
        private String icon;
        private String color;
        private String path;
    }
    
    /**
     * 公告项
     */
    @Data
    public static class AnnouncementItem {
        private Long id;
        private String title;
        private String publishTime;
        private Boolean isRead;
    }

    /**
     * 今日事项。
     */
    @Data
    public static class TodayItem {
        private String id;
        private String type;
        private String module;
        private String sourceLabel;
        private String title;
        private String description;
        private String time;
        private String status;
        private String path;
    }

    /**
     * 风险提醒。
     */
    @Data
    public static class RiskItem {
        private Long id;
        private String businessType;
        private Long businessId;
        private String module;
        private String sourceLabel;
        private String title;
        private String description;
        private String level;
        private String status;
        private String ownerName;
        private String path;
    }

    /**
     * 最近动态。
     */
    @Data
    public static class ActivityItem {
        private String id;
        private String type;
        private String module;
        private String sourceLabel;
        private String title;
        private String content;
        private String operatorName;
        private LocalDateTime eventTime;
        private String path;
    }

    /**
     * 服务健康状态。
     */
    @Data
    public static class ServiceStatus {
        private String status;
        private String message;
    }
}
