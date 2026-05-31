package com.cloudflow.common.statemachine.core;

import java.util.Collections;
import java.util.Set;

/**
 * 字典值集合提供方。由业务侧（cloudflow-system 等）提供实现，
 * 用于启动期 StateMachineRegistry.verifyAll() 校验 @DictBound 注解枚举与字典值是否对齐。
 *
 * <p>本模块仅声明接口，不强制依赖任何字典实现，避免循环依赖。
 * 若运行时上下文中没有 DictValueProvider Bean（例如被 cloudflow-gateway 这种无字典的模块依赖），
 * 字典校验自动跳过，仅打印 INFO 日志。
 */
public interface DictValueProvider {

    /**
     * 返回 dictType 下的所有 dict_value 集合（不含已禁用项）。
     * 字典不存在或为空时返回空集合，不抛异常。
     */
    Set<String> getValues(String dictType);

    /** 默认 NOOP 实现，方便测试或字典缺失场景。 */
    DictValueProvider NOOP = dictType -> Collections.emptySet();
}
