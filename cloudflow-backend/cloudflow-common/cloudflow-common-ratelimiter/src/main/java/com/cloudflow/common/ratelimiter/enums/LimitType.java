package com.cloudflow.common.ratelimiter.enums;

/**
 * 限流类型枚举
 *
 * @author CloudFlow
 */
public enum LimitType {

    /** 默认策略：按接口全局限流 */
    DEFAULT,

    /** 按 IP 限流 */
    IP,

    /** 按用户 ID 限流 */
    USER
}
