package com.cloudflow.common.statemachine.core;

/**
 * 状态机事件标识接口。业务模块每个状态机定义自己的 enum 实现该接口。
 * 仅用于类型约束，避免误把任意字符串当事件传入。
 */
public interface StateEvent {

    /** 事件唯一编码，用于日志/审计。默认取 enum 名称。 */
    default String code() {
        if (this instanceof Enum<?> enumInstance) {
            return enumInstance.name();
        }
        return getClass().getSimpleName();
    }
}
