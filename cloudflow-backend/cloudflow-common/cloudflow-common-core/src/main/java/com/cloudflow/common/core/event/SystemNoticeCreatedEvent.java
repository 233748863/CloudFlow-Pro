package com.cloudflow.common.core.event;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
public class SystemNoticeCreatedEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long noticeId;
    private Long tenantId;
    private Long recipientId;
    private Long senderId;
    private String senderName;
    private String title;
    private String content;
    private String type;
    private String status;
    private LocalDateTime createTime;
}
