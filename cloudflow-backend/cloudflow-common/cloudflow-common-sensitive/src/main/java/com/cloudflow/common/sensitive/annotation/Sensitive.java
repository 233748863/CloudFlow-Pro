package com.cloudflow.common.sensitive.annotation;

import com.cloudflow.common.sensitive.enums.SensitiveType;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记字段在 JSON 序列化时需要脱敏。
 */
@Documented
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Sensitive {

    SensitiveType type() default SensitiveType.AUTO;

    String[] extraSensitiveFields() default {};
}
