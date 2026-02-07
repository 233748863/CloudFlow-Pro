package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.io.Serializable;
import java.util.List;

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
     * 快捷操作
     */
    private List<QuickAction> quickActions;
    
    /**
     * 最新公告（最多3条）
     */
    private List<AnnouncementItem> announcements;
    
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
}
