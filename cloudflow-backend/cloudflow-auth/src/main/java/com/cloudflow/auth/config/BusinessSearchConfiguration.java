package com.cloudflow.auth.config;

import com.cloudflow.common.config.ContextAwareExecutorService;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.CustomizableThreadFactory;

@Configuration(proxyBeanMethods = false)
public class BusinessSearchConfiguration {
    @Bean(name = "businessSearchExecutor", destroyMethod = "shutdown")
    public ExecutorService businessSearchExecutor() {
        return new ContextAwareExecutorService(new ThreadPoolExecutor(4, 16, 60, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(64), new CustomizableThreadFactory("business-search-"), new ThreadPoolExecutor.AbortPolicy()));
    }
}
