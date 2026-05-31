package com.cloudflow.common.statemachine.core;

/**
 * 状态机状态标识接口。业务模块每个状态枚举实现该接口，与 StateEvent 配对。
 */
public interface StateValue {

    /** 状态唯一编码，与字典 dict_data.dict_value 对齐。默认取 enum 名称。 */
    default String code() {
        if (this instanceof Enum<?> enumInstance) {
            return enumInstance.name();
        }
        return getClass().getSimpleName();
    }
}
