package com.cloudflow.workflow.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 工作流事件异步线程池配置
 * 为 WorkflowEventListener 中 @Async("workflowEventExecutor") 提供专用线程池，
 * 确保事件处理不阻塞主流程，同时控制并发数量避免资源耗尽。
 */
@Configuration
@EnableAsync
public class WorkflowEventConfig {

    /**
     * 工作流事件处理专用线程池
     * - 核心线程数 2：日常事件处理足够
     * - 最大线程数 8：应对突发高并发场景
     * - 队列容量 500：缓冲大量事件
     * - 拒绝策略 CallerRunsPolicy：队列满时由调用线程执行，保证事件不丢失
     */
    @Bean("workflowEventExecutor")
    public Executor workflowEventExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(500);
        executor.setKeepAliveSeconds(60);
        executor.setThreadNamePrefix("wf-event-");
        // 队列满时由调用线程执行，保证事件不丢失
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}
