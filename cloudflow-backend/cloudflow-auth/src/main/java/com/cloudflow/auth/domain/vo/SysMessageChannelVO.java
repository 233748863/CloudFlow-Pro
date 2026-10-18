package com.cloudflow.auth.domain.vo;

import com.cloudflow.common.sensitive.annotation.Sensitive;
import com.cloudflow.common.sensitive.enums.SensitiveType;
import lombok.Data;

/**
 * 渠道展示对象，密钥只返回后四位。
 */
@Data
public class SysMessageChannelVO {
    private Long channelId;
    private Long tenantId;
    private String channelType;
    private String channelCode;
    private String channelName;
    private String provider;
    private String signature;
    private String apiKey;
    @Sensitive(type = SensitiveType.SECRET_LAST_FOUR)
    private String apiSecret;
    private String endpoint;
    private String smtpHost;
    private Integer smtpPort;
    private Integer smtpSslFlag;
    private String smtpUsername;
    @Sensitive(type = SensitiveType.SECRET_LAST_FOUR)
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
