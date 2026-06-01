package com.cloudflow.common.idempotent.config;

import com.cloudflow.common.idempotent.aspectj.RepeatSubmitAspect;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * 防重复提交自动配置
 * <p>
 * 引入 cloudflow-common-idempotent 依赖后自动生效，无需额外配置。
 *
 * @author CloudFlow
 */
@AutoConfiguration
@EnableConfigurationProperties(IdempotentProperties.class)
public class IdempotentAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "cloudflow.idempotent", name = "enabled", havingValue = "true", matchIfMissing = true)
    public RepeatSubmitAspect repeatSubmitAspect(StringRedisTemplate redisTemplate,
                                                  ObjectMapper objectMapper,
                                                  SysConfigHelper sysConfigHelper,
                                                  IdempotentProperties properties) {
        return new RepeatSubmitAspect(redisTemplate, objectMapper, sysConfigHelper, properties);
    }
}
