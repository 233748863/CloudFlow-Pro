package com.cloudflow.auth.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 当前用户消息展示对象。
 */
@Data
public class MyMessageVO {
    private Long recordId;
    private String templateCode;
    private String channelType;
    private String receiverName;
    private String senderName;
    private String title;
    private String content;
    private String messageCategory;
    private String bizType;
    private String bizId;
    private String linkUrl;
    private String sendStatus;
    private Integer readFlag;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sendTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
