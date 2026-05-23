package com.cloudflow.gateway.ratelimit;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.io.Serializable;

/**
 * GOV-P1-1 API 动态限流规则在网关侧的本地快照。
 *
 * <p>与 {@code com.cloudflow.auth.domain.SysApiRatelimitRule} 字段对齐，但故意不依赖 auth 模块，
 * 保持网关与业务服务的解耦。从 Redis Hash 反序列化时按字段名映射，时间字段一律忽略。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class SysApiRatelimitRuleSnapshot implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long id;
    private Long tenantId;
    private String ruleCode;
    private String ruleName;
    private String serviceName;
    private String pathPattern;
    /** GET / POST / PUT / DELETE / ALL */
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
}
