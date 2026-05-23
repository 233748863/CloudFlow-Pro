package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * GOV-P0-1 IP 黑白名单。
 *
 * <p>规则持久化在 sys_ip_acl, 同步到 Redis Hash {@code cloudflow:acl:ip:active}
 * 并通过 pubsub 通道 {@code cloudflow:acl:ip} 通知网关 BlacklistFilter 热加载。
 */
@Data
@TableName("sys_ip_acl")
public class SysIpAcl implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
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
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
