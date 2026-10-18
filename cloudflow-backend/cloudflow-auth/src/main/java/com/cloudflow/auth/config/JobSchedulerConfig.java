package com.cloudflow.auth.config;

import java.util.concurrent.ScheduledThreadPoolExecutor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 集中任务调度线程池。
 */
@Configuration
public class JobSchedulerConfig {
    @Bean(name = "jobTaskScheduler")
    public ThreadPoolTaskScheduler jobTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);
        scheduler.setThreadNamePrefix("cloudflow-job-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(30);
        scheduler.initialize();
        return scheduler;
    }

    @Bean(name = "jobDispatchExecutor")
    public Executor jobDispatchExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("cloudflow-job-dispatch-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.initialize();
        return executor;
    }

    @Bean
    public HealthIndicator jobSchedulerHealthIndicator(
            @Qualifier("jobTaskScheduler") ThreadPoolTaskScheduler scheduler) {
        return () -> {
            ScheduledThreadPoolExecutor executor = scheduler.getScheduledThreadPoolExecutor();
            if (executor.isShutdown() || executor.isTerminated()) {
                return Health.down().withDetail("state", "stopped").build();
            }
            return Health.up()
                    .withDetail("poolSize", executor.getPoolSize())
                    .withDetail("queuedTasks", executor.getQueue().size())
                    .build();
        };
    }
}
