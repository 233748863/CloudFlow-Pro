package com.cloudflow.common.core.event;

import lombok.Data;

import java.io.Serializable;

@Data
public class SystemNoticeDispatchEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long tenantId;
    private Long recipientId;
    private Long senderId;
    private String senderName;
    private String title;
    private String content;
    private String type;
}
