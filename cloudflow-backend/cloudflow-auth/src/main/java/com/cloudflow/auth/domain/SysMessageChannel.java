package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 消息渠道配置。
 */
@Data
@TableName("sys_message_channel")
public class SysMessageChannel implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long channelId;
    private Long tenantId;
    private String channelType;
    private String channelCode;
    private String channelName;
    private String provider;
    private String signature;
    private String apiKey;
    private String apiSecretCipher;
    private String endpoint;
    private String smtpHost;
    private Integer smtpPort;
    private Integer smtpSslFlag;
    private String smtpUsername;
    private String smtpPwdCipher;
    private String fromAddress;
    private String fromName;
    private String callbackUrl;
    private Integer priority;
    private Integer rateLimitMinute;
    private Integer dailyLimit;
    private Integer retryCount;
    private Integer retryIntervalSec;
    private Integer implementedFlag;
    private String status;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
