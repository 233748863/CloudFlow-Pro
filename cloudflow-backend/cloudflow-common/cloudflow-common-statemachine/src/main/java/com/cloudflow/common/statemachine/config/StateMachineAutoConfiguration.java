package com.cloudflow.common.statemachine.config;

import com.cloudflow.common.statemachine.core.DictValueProvider;
import com.cloudflow.common.statemachine.core.StateMachineDefinition;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.common.statemachine.exception.StateMachineExceptionHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

import java.util.List;

/**
 * 状态机自动配置。
 * <ul>
 *   <li>注册 StateMachineRegistry Bean；</li>
 *   <li>收集所有 StateMachineDefinition Bean，依次调用 register；</li>
 *   <li>注册 StateMachineLifecycle，在 Spring 启动收尾阶段触发 verifyAll()。</li>
 * </ul>
 */
@AutoConfiguration
@EnableConfigurationProperties(StateMachineProperties.class)
public class StateMachineAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(StateMachineAutoConfiguration.class);

    @Bean
    @ConditionalOnMissingBean
    public DictValueProvider dictValueProvider() {
        log.warn("未找到 DictValueProvider Bean，将按配置决定是否阻断启动");
        return new DictValueProvider() {
            @Override
            public java.util.Set<String> getValues(String dictType) {
                return java.util.Collections.emptySet();
            }

            @Override
            public boolean available() {
                return false;
            }
        };
    }

    @Bean
    public StateMachineRegistry stateMachineRegistry(DictValueProvider dictValueProvider,
                                                      StateMachineProperties properties,
                                                      @Autowired(required = false) List<StateMachineDefinition> definitions) {
        StateMachineRegistry registry = new StateMachineRegistry(dictValueProvider, properties);
        if (definitions != null && !definitions.isEmpty()) {
            log.info("发现 {} 个 StateMachineDefinition，开始注册", definitions.size());
            for (StateMachineDefinition def : definitions) {
                def.register(registry);
            }
        } else {
            log.warn("未发现任何 StateMachineDefinition Bean，状态机注册表为空");
        }
        return registry;
    }

    @Bean
    public StateMachineLifecycle stateMachineLifecycle(StateMachineRegistry registry) {
        return new StateMachineLifecycle(registry);
    }

    @Bean
    @ConditionalOnMissingBean
    public StateMachineExceptionHandler stateMachineExceptionHandler() {
        return new StateMachineExceptionHandler();
    }
}
