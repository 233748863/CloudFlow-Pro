package com.cloudflow.hr.config;

/**
 * 业务规则服务降级策略。
 */
public enum RuleFallbackPolicy {
    PASS,
    WARN,
    DENY
}
