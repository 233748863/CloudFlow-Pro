package com.cloudflow.auth.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/** 消息记录管理展示对象，不暴露密文和内部幂等字段。 */
@Data
public class SysMessageRecordVO {
    private Long recordId;
    private Long deliveryId;
    private String traceId;
    private String templateCode;
    private String channelType;
    private Long channelId;
    private String receiverType;
    private Long receiverId;
    private String receiverAddrMask;
    private String receiverName;
    private String title;
    private String content;
    private String messageCategory;
    private String bizType;
    private String bizId;
    private String linkUrl;
    private String sendStatus;
    private String skipReason;
    private Integer retryCount;
    private String errorMsg;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sendTime;
    private Integer readFlag;
    private Long resendFromId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime readTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
