package com.cloudflow.common.statemachine.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 字典绑定注解。状态枚举字段或 enum 类上声明 dictType，
 * 启动期 StateMachineRegistry.verifyAll() 校验「枚举值集合」与「dict_data.dict_value 集合」一致，
 * 不一致则启动失败。
 *
 * <p>放在 enum 类上：
 * <pre>
 * &#64;DictBound("sys_announcement_status")
 * public enum AnnouncementStatus implements StateValue { DRAFT, PUBLISHED, ARCHIVED }
 * </pre>
 */
@Target({ElementType.TYPE, ElementType.FIELD})
@Retention(RetentionPolicy.RUNTIME)
public @interface DictBound {

    /** dict_type.dict_type 编码 */
    String value();

    /** 是否要求字典值与枚举值一一对应；false 表示枚举只需是字典子集即可。默认 true。 */
    boolean strict() default true;
}
