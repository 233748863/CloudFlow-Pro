package com.cloudflow.gateway.acl;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * GOV-P0-1 IP 黑白名单在网关侧的本地快照。
 *
 * <p>从 Redis Hash 反序列化, 字段对齐 {@code com.cloudflow.auth.domain.SysIpAcl} 但不依赖 auth 模块。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class IpAclSnapshot implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long id;
    private Long tenantId;
    private String ruleCode;
    private String ruleName;
    private String ipPattern;
    /** EXACT / CIDR / RANGE */
    private String ruleType;
    /** BLACK / WHITE */
    private String mode;
    private Integer priority;
    /** ACTIVE / INACTIVE */
    private String status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime expireAt;

    private String reason;
    private Integer deleted;
}
