package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 消息发送记录。
 */
@Data
@TableName("sys_message_record")
public class SysMessageRecord implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long recordId;
    private Long tenantId;
    private String traceId;
    private String templateCode;
    private String channelType;
    private Long channelId;
    private String receiverType;
    private Long receiverId;
    private String receiverAddrMask;
    private String receiverAddrCipher;
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
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime readTime;
    private Long resendFromId;
    private String outboxEventId;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
