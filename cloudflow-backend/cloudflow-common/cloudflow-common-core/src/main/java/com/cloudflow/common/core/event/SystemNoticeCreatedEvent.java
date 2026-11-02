package com.cloudflow.common.core.event;

import com.fasterxml.jackson.annotation.JsonFormat;
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
    private String linkUrl;
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSS")
    private LocalDateTime createTime;
}
