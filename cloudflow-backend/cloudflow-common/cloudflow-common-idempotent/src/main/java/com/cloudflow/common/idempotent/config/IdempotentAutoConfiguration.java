package com.cloudflow.common.idempotent.config;

import com.cloudflow.common.idempotent.aspectj.RepeatSubmitAspect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
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
public class IdempotentAutoConfiguration {

    @Bean
    public RepeatSubmitAspect repeatSubmitAspect(StringRedisTemplate redisTemplate) {
        return new RepeatSubmitAspect(redisTemplate);
    }
}
