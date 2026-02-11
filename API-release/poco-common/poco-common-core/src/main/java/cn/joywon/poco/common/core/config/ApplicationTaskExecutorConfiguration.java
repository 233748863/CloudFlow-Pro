package cn.joywon.poco.common.core.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class ApplicationTaskExecutorConfiguration {

    @Bean("applicationTaskExecutor")
    public ThreadPoolTaskExecutor executor() {
        return new ThreadPoolTaskExecutor();
    }

}