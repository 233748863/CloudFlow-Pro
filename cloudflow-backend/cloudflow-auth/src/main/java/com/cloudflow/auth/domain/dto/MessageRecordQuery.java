package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 消息记录查询条件。
 */
@Data
public class MessageRecordQuery {
    private String channelType;
    private String sendStatus;
    private String templateCode;
    private String bizType;
    private Long receiverId;
    private String beginTime;
    private String endTime;
}
