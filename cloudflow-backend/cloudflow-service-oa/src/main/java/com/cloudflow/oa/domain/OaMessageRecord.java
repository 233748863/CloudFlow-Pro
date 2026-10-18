package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * OA 只读消息投影，对应统一消息记录表。
 */
@Data
@TableName("sys_message_record")
public class OaMessageRecord {
    @TableId
    private Long recordId;
    private Long tenantId;
    private String templateCode;
    private String channelType;
    private String receiverType;
    private Long receiverId;
    private String receiverName;
    private String title;
    private String content;
    private String messageCategory;
    private String bizType;
    private String bizId;
    private String linkUrl;
    private String sendStatus;
    private Integer readFlag;
    private LocalDateTime sendTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private LocalDateTime readTime;
}
