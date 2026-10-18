package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 只读统一消息记录投影。消息写入由 common-message SDK 完成。
 */
@Data
@TableName("sys_message_record")
public class HrMessageRecord {
    @TableId(type = IdType.AUTO)
    private Long recordId;
    private Long tenantId;
    private Long receiverId;
    private String channelType;
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
