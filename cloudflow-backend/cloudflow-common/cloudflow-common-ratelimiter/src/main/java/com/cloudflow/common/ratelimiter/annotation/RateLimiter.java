package com.cloudflow.common.ratelimiter.annotation;

import com.cloudflow.common.ratelimiter.enums.LimitType;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 接口限流注解
 * <p>
 * 后台可在线维护的接口限流优先使用 sys_api_ratelimit_rule；该注解仅保留给非网关入口或模块内兜底场景。
 *
 * @author CloudFlow
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RateLimiter {

    /**
     * 限流 Key 前缀（为空则自动生成）
     */
    String key() default "";

    /**
     * 限流时间窗口（秒）
     */
    int time() default 60;

    /**
     * 时间窗口内最大请求次数
     */
    int count() default 100;

    /**
     * 限流类型
     */
    LimitType limitType() default LimitType.DEFAULT;

    /**
     * 限流提示消息
     */
    String message() default "请求过于频繁，请稍后再试";
}
