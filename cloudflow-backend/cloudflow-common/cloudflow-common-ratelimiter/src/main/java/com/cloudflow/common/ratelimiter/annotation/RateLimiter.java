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
 * 使用方式：在 Controller 方法上添加 @RateLimiter 即可
 * <pre>
 * // 示例：每秒最多 10 次请求（全局）
 * @RateLimiter(count = 10, time = 1)
 * @GetMapping("/list")
 * public R<?> list() { ... }
 *
 * // 示例：每个用户每分钟最多 5 次（按用户限流）
 * @RateLimiter(count = 5, time = 60, limitType = LimitType.USER)
 * @PostMapping("/apply")
 * public R<?> apply() { ... }
 *
 * // 示例：每个 IP 每秒最多 20 次
 * @RateLimiter(count = 20, time = 1, limitType = LimitType.IP)
 * @GetMapping("/search")
 * public R<?> search() { ... }
 * </pre>
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
