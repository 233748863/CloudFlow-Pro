package com.cloudflow.auth.service.remote;

import lombok.Data;

@Data
public class NoticeSendRequest {

    private Long recipientId;
    private String title;
    private String content;
    private String type;
    private Long senderId;
    private String senderName;
}
