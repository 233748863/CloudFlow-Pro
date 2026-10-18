package com.cloudflow.common.job.config;

import com.cloudflow.common.job.aspect.DistributedJobAspect;
import com.cloudflow.common.config.ContextTaskDecorator;
import org.redisson.api.RedissonClient;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 定时任务自动配置类
 * 启用 Spring Scheduling 并注册分布式任务切面
 *
 * @author CloudFlow
 */
@AutoConfiguration
@EnableScheduling
public class JobAutoConfiguration {

    @Bean
    public DistributedJobAspect distributedJobAspect(RedissonClient redissonClient) {
        return new DistributedJobAspect(redissonClient);
    }

    @Bean(name = "jobHandlerExecutor")
    @ConditionalOnMissingBean(name = "jobHandlerExecutor")
    public Executor jobHandlerExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(16);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("cloudflow-job-handler-");
        // 任务执行接口必须立即返回；队列满时禁止回落到 HTTP 调用线程执行。
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setTaskDecorator(new ContextTaskDecorator());
        executor.initialize();
        return executor;
    }

    @Bean(name = "jobHandlerHeartbeatScheduler")
    @ConditionalOnMissingBean(name = "jobHandlerHeartbeatScheduler")
    public ThreadPoolTaskScheduler jobHandlerHeartbeatScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("cloudflow-job-heartbeat-");
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        scheduler.initialize();
        return scheduler;
    }
}
