package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class SyncDownloadDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String syncTime;

    private List<MessageData> messages;

    private List<AnnouncementData> announcements;

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
