package com.cloudflow.common.statemachine.core;

import com.cloudflow.common.statemachine.annotation.DictBound;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * 全局状态机注册表。
 * <ul>
 *   <li>启动期：业务侧 StateMachineDefinition 调用 register(...) 把状态机加进来；</li>
 *   <li>运行期：业务方法 stateMachine = registry.require("SysAnnouncement")，再 fire；</li>
 *   <li>启动收尾：StateMachineLifecycle 触发 verifyAll() —— 检查所有 @DictBound 枚举与字典是否对齐，不一致即启动失败。</li>
 * </ul>
 *
 * <p>线程模型：register 仅在启动期调用，运行期只读，无锁。
 */
public class StateMachineRegistry {

    private static final Logger log = LoggerFactory.getLogger(StateMachineRegistry.class);

    private final Map<String, StateMachine<?, ?>> machines = new LinkedHashMap<>();
    private final DictValueProvider dictValueProvider;

    public StateMachineRegistry(DictValueProvider dictValueProvider) {
        this.dictValueProvider = dictValueProvider != null ? dictValueProvider : DictValueProvider.NOOP;
    }

    /** 注册状态机。entityName 重复抛 IllegalStateException。 */
    public synchronized <S extends StateValue, E extends StateEvent> void register(StateMachine<S, E> machine) {
        Objects.requireNonNull(machine, "machine");
        StateMachine<?, ?> exist = machines.putIfAbsent(machine.entityName(), machine);
        if (exist != null) {
            throw new IllegalStateException("StateMachine 已重复注册: " + machine.entityName());
        }
        log.info("StateMachine registered: {} ({} transitions, {} terminals)",
                machine.entityName(), machine.transitions().size(), machine.terminalStates().size());
    }

    /** 按实体名取状态机；缺失抛 IllegalStateException（属于编程错误，不是业务异常）。 */
    @SuppressWarnings("unchecked")
    public <S extends StateValue, E extends StateEvent> StateMachine<S, E> require(String entityName) {
        StateMachine<?, ?> machine = machines.get(entityName);
        if (machine == null) {
            throw new IllegalStateException("StateMachine 未注册: " + entityName);
        }
        return (StateMachine<S, E>) machine;
    }

    public Map<String, StateMachine<?, ?>> all() {
        return Collections.unmodifiableMap(machines);
    }

    /**
     * 启动期一致性校验。
     * <ol>
     *   <li>对每个状态机的 stateType（必须是 enum）取出全部枚举值；</li>
     *   <li>若 stateType 上有 @DictBound，加载字典值集合做集合比对；</li>
     *   <li>strict=true：枚举值集合必须等于字典值集合；strict=false：枚举值集合必须是字典子集；</li>
     *   <li>失败则抛 IllegalStateException，让 Spring 启动失败 fail-fast。</li>
     * </ol>
     *
     * <p>若 DictValueProvider 是 NOOP（无字典上下文）或字典查不到值，仅打印 INFO 跳过，不阻塞启动。
     */
    public void verifyAll() {
        log.info("StateMachineRegistry.verifyAll() 开始，共 {} 个状态机", machines.size());
        List<String> errors = new java.util.ArrayList<>();

        for (StateMachine<?, ?> machine : machines.values()) {
            try {
                verifyOne(machine);
            } catch (RuntimeException ex) {
                errors.add(ex.getMessage());
            }
        }

        if (!errors.isEmpty()) {
            String joined = String.join("\n  - ", errors);
            throw new IllegalStateException("StateMachineRegistry.verifyAll() 失败:\n  - " + joined);
        }
        log.info("StateMachineRegistry.verifyAll() 通过");
    }

    private void verifyOne(StateMachine<?, ?> machine) {
        Class<?> stateType = machine.stateType();
        if (!stateType.isEnum()) {
            // 状态类型必须是 enum 才能枚举所有值
            throw new IllegalStateException(machine.entityName() + " stateType 必须是 enum，实际为 " + stateType);
        }

        Set<String> enumCodes = enumCodes(stateType);
        DictBound dict = stateType.getAnnotation(DictBound.class);
        if (dict == null) {
            // 没有字典绑定，只校验 transitions 引用的状态都在 enum 范围
            log.debug("[{}] 无 @DictBound，跳过字典校验", machine.entityName());
            return;
        }

        Set<String> dictValues = dictValueProvider.getValues(dict.value());
        if (dictValues == null || dictValues.isEmpty()) {
            // 字典系统未启用 / 字典数据未初始化 → 只警告不失败，避免无字典环境（如 gateway）启动失败
            log.warn("[{}] @DictBound({}) 字典值为空，跳过字典一致性校验。请确认字典数据已初始化。",
                    machine.entityName(), dict.value());
            return;
        }

        Set<String> missingInDict = new TreeSet<>(enumCodes);
        missingInDict.removeAll(dictValues);
        Set<String> missingInEnum = new TreeSet<>(dictValues);
        missingInEnum.removeAll(enumCodes);

        if (!missingInDict.isEmpty()) {
            throw new IllegalStateException(
                    machine.entityName() + " 枚举值在字典 " + dict.value() + " 中缺失: " + missingInDict);
        }
        if (dict.strict() && !missingInEnum.isEmpty()) {
            throw new IllegalStateException(
                    machine.entityName() + " 字典 " + dict.value() + " 中存在枚举未声明的值: " + missingInEnum
                            + " (strict=true)");
        }
        log.info("[{}] @DictBound({}) 字典一致性通过 ({} 项)",
                machine.entityName(), dict.value(), enumCodes.size());
    }

    private static Set<String> enumCodes(Class<?> enumType) {
        Object[] constants = enumType.getEnumConstants();
        return Arrays.stream(constants)
                .map(o -> ((StateValue) o).code())
                .collect(Collectors.toCollection(TreeSet::new));
    }
}
