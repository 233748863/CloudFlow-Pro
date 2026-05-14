package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.io.Serializable;
import java.util.List;

/**
 * 离线数据下载 DTO
 */
@Data
public class SyncDownloadDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 同步时间戳（毫秒） */
    private Long syncTime;

    /** 任务数据 */
    private List<TaskData> tasks;

    /** 消息数据 */
    private List<MessageData> messages;

    /** 公告数据 */
    private List<AnnouncementData> announcements;

    @Data
    public static class TaskData implements Serializable {
        private static final long serialVersionUID = 1L;

        private String taskId;
        private String taskName;
        private String processName;
        private String status;
        private String createTime;
        private String updateTime;
    }

    @Data
    public static class MessageData implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long noticeId;
        private String title;
        private String content;
        private String type;
        private String createTime;
        private Boolean isRead;
    }

    @Data
    public static class AnnouncementData implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long id;
        private String title;
        private String content;
        private String publishTime;
        private Boolean isRead;
    }
}
