package com.cloudflow.workflow.annotation;

import com.cloudflow.workflow.enums.OperationType;
import com.cloudflow.workflow.enums.TargetType;

import java.lang.annotation.*;

/**
 * 审计日志注解
 * 用于标记需要记录审计日志的方法
 * 
 * @author CloudFlow
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AuditLog {

    /**
     * 操作类型
     */
    OperationType operationType();

    /**
     * 操作对象类型
     */
    TargetType targetType();

    /**
     * 操作描述
     */
    String description() default "";
}
