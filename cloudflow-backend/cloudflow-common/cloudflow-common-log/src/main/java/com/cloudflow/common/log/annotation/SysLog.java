package com.cloudflow.common.log.annotation;

import java.lang.annotation.*;

/**
 * 操作日志注解
 * <p>
 * 标注在 Controller 方法上，自动记录操作日志到数据库。
 * 支持 SPEL 表达式动态生成日志描述。
 * </p>
 *
 * 使用示例：
 * <pre>
 * // 简单用法：固定描述
 * {@code @SysLog("导入用户数据")}
 *
 * // 高级用法：SPEL 表达式动态描述
 * {@code @SysLog(value = "用户登录", expression = "#username + '登录系统'")}
 * </pre>
 *
 * @author CloudFlow
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface SysLog {

    /**
     * 日志描述（静态文本）
     * @return 描述文本
     */
    String value() default "";

    /**
     * SPEL 表达式（动态描述）
     * <p>当此属性不为空时，会覆盖 value 的值</p>
     * @return SPEL 表达式字符串
     */
    String expression() default "";
}
