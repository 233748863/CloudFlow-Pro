package com.cloudflow.auth.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 权限校验注解（参考 Poco 的 @HasPermission）
 * 标注在 Controller 方法上，用于接口级权限拦截
 * 
 * 使用示例：
 * @HasPermission("system:user:list")
 * @HasPermission({"system:user:add", "system:user:edit"})
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface HasPermission {
    /**
     * 需要的权限标识，多个之间是 OR 关系（任一满足即可）
     */
    String[] value() default {};
}
