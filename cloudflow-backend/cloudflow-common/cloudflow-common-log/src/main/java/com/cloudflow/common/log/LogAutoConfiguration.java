package com.cloudflow.common.log;

import com.cloudflow.common.log.aspect.SysLogAspect;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.log.event.SysLogListener;
import com.cloudflow.common.log.mapper.SysLogMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * 操作日志自动配置
 * <p>
 * 通过 {@code cloudflow.log.enabled=true}（默认）启用。
 * 自动注册切面、事件监听器等组件。
 * </p>
 *
 * @author CloudFlow
 */
@EnableAsync
@Configuration
@EnableConfigurationProperties(CloudFlowLogProperties.class)
@MapperScan("com.cloudflow.common.log.mapper")
@ConditionalOnProperty(prefix = "cloudflow.log", name = "enabled", havingValue = "true", matchIfMissing = true)
public class LogAutoConfiguration {

    /**
     * 操作日志切面
     */
    @Bean
    public SysLogAspect sysLogAspect(ApplicationEventPublisher eventPublisher, ObjectMapper objectMapper) {
        return new SysLogAspect(eventPublisher, objectMapper);
    }

    /**
     * 操作日志事件监听器（异步入库）
     */
    @Bean
    public SysLogListener sysLogListener(SysLogMapper sysLogMapper,
                                         CloudFlowLogProperties logProperties,
                                         ObjectMapper objectMapper) {
        return new SysLogListener(sysLogMapper, logProperties, objectMapper);
    }
}
