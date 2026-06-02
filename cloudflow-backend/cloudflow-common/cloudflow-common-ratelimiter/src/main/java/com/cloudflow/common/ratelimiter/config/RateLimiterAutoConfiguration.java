package com.cloudflow.common.ratelimiter.config;

import com.cloudflow.common.ratelimiter.aspectj.RateLimiterAspect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.scripting.support.ResourceScriptSource;

/**
 * 限流模块自动配置
 *
 * @author CloudFlow
 */
@AutoConfiguration
public class RateLimiterAutoConfiguration {

    @Bean
    public RedisScript<Long> rateLimiterScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setScriptSource(new ResourceScriptSource(new ClassPathResource("lua/rate_limiter.lua")));
        script.setResultType(Long.class);
        return script;
    }

    @Bean("cloudflowRateLimiterAspect")
    public RateLimiterAspect rateLimiterAspect(StringRedisTemplate redisTemplate, RedisScript<Long> rateLimiterScript) {
        return new RateLimiterAspect(redisTemplate, rateLimiterScript);
    }
}
