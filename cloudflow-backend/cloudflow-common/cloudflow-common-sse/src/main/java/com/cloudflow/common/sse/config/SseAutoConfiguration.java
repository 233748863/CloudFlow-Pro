package com.cloudflow.common.sse.config;

import com.cloudflow.common.sse.core.SseEmitterManager;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * SSE 自动配置类
 *
 * @author CloudFlow
 */
@AutoConfiguration
public class SseAutoConfiguration {

    @Bean
    public SseEmitterManager sseEmitterManager() {
        return new SseEmitterManager();
    }
}
