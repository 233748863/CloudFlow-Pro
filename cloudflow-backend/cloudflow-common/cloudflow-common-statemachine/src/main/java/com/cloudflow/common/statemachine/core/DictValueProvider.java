package com.cloudflow.common.statemachine.core;

import java.util.Set;

/**
 * 字典值集合提供方。由业务侧（cloudflow-system 等）提供实现，
 * 用于启动期 StateMachineRegistry.verifyAll() 校验 @DictBound 注解枚举与字典值是否对齐。
 *
 * <p>本模块仅声明接口，不强制依赖任何字典实现，避免循环依赖。
 * 若运行时上下文中没有 DictValueProvider Bean（例如被 cloudflow-gateway 这种无字典的模块依赖），
 * 由自动配置决定是严格失败还是警告跳过。
 */
public interface DictValueProvider {

    /**
     * 返回 dictType 下的所有 dict_value 集合（不含已禁用项）。
     * 字典不存在或为空时返回空集合，不抛异常。
     */
    Set<String> getValues(String dictType);

    /**
     * 当前实现是否具备真实字典能力。
     */
    default boolean available() {
        return true;
    }
}
