package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * GOV-P1-1 API 动态限流规则。
 *
 * <p>规则维护在 sys_api_ratelimit_rule 表，落表后通过 Redis pubsub 通道
 * {@code cloudflow:ratelimit:rules} 通知网关 DynamicRateLimitFilter 热加载，
 * 同时把全量启用规则缓存在 Redis Hash {@code cloudflow:ratelimit:rules:active} 用于冷启动。
 */
@Data
@TableName("sys_api_ratelimit_rule")
public class SysApiRatelimitRule implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String ruleCode;
    private String ruleName;
    private String serviceName;
    private String pathPattern;
    /** GET/POST/PUT/DELETE/ALL */
    private String httpMethod;
    /** IP / USER / TENANT / GLOBAL */
    private String dimension;
    private Integer rps;
    private Integer burst;
    /** ACTIVE / INACTIVE */
    private String status;
    private Integer priority;
    /** REJECT / QUEUE / LOG */
    private String rejectStrategy;
    private String remark;
    private Integer deleted;
    @Version
    private Integer version;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
