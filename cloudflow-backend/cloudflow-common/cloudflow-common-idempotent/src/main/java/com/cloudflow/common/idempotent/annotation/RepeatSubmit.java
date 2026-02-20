package com.cloudflow.common.idempotent.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.concurrent.TimeUnit;

/**
 * 防重复提交注解
 * <p>
 * 使用方式：在 Controller 方法上添加 @RepeatSubmit 即可
 * <pre>
 * // 示例：5秒内不允许重复提交
 * @RepeatSubmit(interval = 5000)
 * @PostMapping("/submit")
 * public R<?> submit(@RequestBody LeaveRequest request) { ... }
 *
 * // 示例：自定义提示消息
 * @RepeatSubmit(interval = 3000, message = "请勿重复提交请假申请")
 * @PostMapping("/leave")
 * public R<?> applyLeave(@RequestBody LeaveRequest request) { ... }
 * </pre>
 *
 * @author CloudFlow
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RepeatSubmit {

    /**
     * 间隔时间（毫秒），在此时间内不允许重复提交
     * 默认 5000 毫秒（5秒）
     */
    int interval() default 5000;

    /**
     * 时间单位，默认毫秒
     */
    TimeUnit timeUnit() default TimeUnit.MILLISECONDS;

    /**
     * 重复提交时的提示消息
     */
    String message() default "请勿重复提交，请稍后再试";
}
