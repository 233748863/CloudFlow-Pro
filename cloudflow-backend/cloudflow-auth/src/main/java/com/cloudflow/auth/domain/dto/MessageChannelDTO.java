package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 消息渠道维护请求。
 */
@Data
public class MessageChannelDTO {
    private Long channelId;
    @NotBlank(message = "渠道类型不能为空")
    private String channelType;
    @NotBlank(message = "渠道编码不能为空")
    private String channelCode;
    @NotBlank(message = "渠道名称不能为空")
    private String channelName;
    private String provider;
    private String signature;
    private String apiKey;
    private String apiSecret;
    private String endpoint;
    private String smtpHost;
    private Integer smtpPort;
    private Integer smtpSslFlag;
    private String smtpUsername;
    private String smtpPwd;
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
}
