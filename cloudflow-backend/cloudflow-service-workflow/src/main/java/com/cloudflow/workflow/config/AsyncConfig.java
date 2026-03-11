package com.cloudflow.workflow.config;

import com.cloudflow.common.config.ContextTaskDecorator;
import com.cloudflow.common.core.utils.SysConfigHelper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 异步处理配置
 * 用于异步执行通知、日志、事件等非核心操作
 * 
 * 配置项（从sys_config读取）：
 * - sys.workflow.async.workflow.corePoolSize（全局）：工作流线程池核心线程数，默认10
 * - sys.workflow.async.workflow.maxPoolSize（全局）：工作流线程池最大线程数，默认20
 * - sys.workflow.async.workflow.queueCapacity（全局）：工作流线程池队列容量，默认200
 * - sys.workflow.async.notification.corePoolSize（全局）：通知线程池核心线程数，默认5
 * - sys.workflow.async.notification.maxPoolSize（全局）：通知线程池最大线程数，默认10
 * - sys.workflow.async.audit.corePoolSize（全局）：审计线程池核心线程数，默认3
 * 
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Slf4j
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Autowired(required = false)
    private SysConfigHelper sysConfigHelper;

    // 默认配置值
    private int workflowCorePoolSize = 10;
    private int workflowMaxPoolSize = 20;
    private int workflowQueueCapacity = 200;
    private int notificationCorePoolSize = 5;
    private int notificationMaxPoolSize = 10;
    private int notificationQueueCapacity = 100;
    private int auditCorePoolSize = 3;
    private int auditMaxPoolSize = 5;
    private int auditQueueCapacity = 500;

    /**
     * 从sys_config加载配置
     */
    @PostConstruct
    public void loadFromSysConfig() {
        if (sysConfigHelper == null) {
            log.warn("SysConfigHelper未注入，异步配置使用默认值");
            return;
        }

        try {
            // 工作流线程池配置
            workflowCorePoolSize = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.workflow.corePoolSize", workflowCorePoolSize);
            workflowMaxPoolSize = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.workflow.maxPoolSize", workflowMaxPoolSize);
            workflowQueueCapacity = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.workflow.queueCapacity", workflowQueueCapacity);

            // 通知线程池配置
            notificationCorePoolSize = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.notification.corePoolSize", notificationCorePoolSize);
            notificationMaxPoolSize = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.notification.maxPoolSize", notificationMaxPoolSize);
            notificationQueueCapacity = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.notification.queueCapacity", notificationQueueCapacity);

            // 审计线程池配置
            auditCorePoolSize = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.audit.corePoolSize", auditCorePoolSize);
            auditMaxPoolSize = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.audit.maxPoolSize", auditMaxPoolSize);
            auditQueueCapacity = sysConfigHelper.getGlobalInt(
                "sys.workflow.async.audit.queueCapacity", auditQueueCapacity);

            log.info("异步配置已从sys_config加载: workflow[{}/{}], notification[{}/{}], audit[{}/{}]",
                workflowCorePoolSize, workflowMaxPoolSize,
                notificationCorePoolSize, notificationMaxPoolSize,
                auditCorePoolSize, auditMaxPoolSize);
        } catch (Exception e) {
            log.warn("从sys_config加载异步配置失败，使用默认值: {}", e.getMessage());
        }
    }

    /**
     * 工作流异步执行器
     * 用于处理工作流相关的异步任务
     */
    @Bean("workflowExecutor")
    public ThreadPoolTaskExecutor workflowExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        
        // 核心线程数（从配置读取）
        executor.setCorePoolSize(workflowCorePoolSize);
        
        // 最大线程数（从配置读取）
        executor.setMaxPoolSize(workflowMaxPoolSize);
        
        // 队列容量（从配置读取）
        executor.setQueueCapacity(workflowQueueCapacity);
        
        // 线程名称前缀
        executor.setThreadNamePrefix("workflow-async-");
        
        // 线程空闲时间（秒）
        executor.setKeepAliveSeconds(60);
        
        // 拒绝策略：由调用线程执行
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        
        // 等待所有任务完成后再关闭线程池
        executor.setWaitForTasksToCompleteOnShutdown(true);
        
        // 等待时间（秒）
        executor.setAwaitTerminationSeconds(60);

        // 传递用户、租户和请求上下文，保证异步任务中的审计信息完整
        executor.setTaskDecorator(new ContextTaskDecorator());

        executor.initialize();
        
        log.info("工作流异步执行器初始化完成: corePoolSize={}, maxPoolSize={}, queueCapacity={}", 
            executor.getCorePoolSize(), 
            executor.getMaxPoolSize(), 
            executor.getQueueCapacity());
        
        return executor;
    }

    /**
     * 通知异步执行器
     * 专门用于发送通知（邮件、短信、站内信）
     */
    @Bean("notificationExecutor")
    public ThreadPoolTaskExecutor notificationExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        
        executor.setCorePoolSize(notificationCorePoolSize);
        executor.setMaxPoolSize(notificationMaxPoolSize);
        executor.setQueueCapacity(notificationQueueCapacity);
        executor.setThreadNamePrefix("notification-async-");
        executor.setKeepAliveSeconds(60);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);

        // 通知、发布等异步任务也需要保留上下文，便于后续扩展统一审计
        executor.setTaskDecorator(new ContextTaskDecorator());

        executor.initialize();
        
        log.info("通知异步执行器初始化完成: corePoolSize={}, maxPoolSize={}, queueCapacity={}", 
            executor.getCorePoolSize(), 
            executor.getMaxPoolSize(), 
            executor.getQueueCapacity());
        
        return executor;
    }

    /**
     * 审计日志异步执行器
     * 专门用于记录审计日志
     */
    @Bean("auditExecutor")
    public ThreadPoolTaskExecutor auditExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        
        executor.setCorePoolSize(auditCorePoolSize);
        executor.setMaxPoolSize(auditMaxPoolSize);
        executor.setQueueCapacity(auditQueueCapacity);
        executor.setThreadNamePrefix("audit-async-");
        executor.setKeepAliveSeconds(60);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);

        // 审计线程池必须保留请求上下文，否则无法获取真实来源信息
        executor.setTaskDecorator(new ContextTaskDecorator());

        executor.initialize();
        
        log.info("审计日志异步执行器初始化完成: corePoolSize={}, maxPoolSize={}, queueCapacity={}", 
            executor.getCorePoolSize(), 
            executor.getMaxPoolSize(), 
            executor.getQueueCapacity());
        
        return executor;
    }

    /**
     * 默认异步执行器
     */
    @Override
    public Executor getAsyncExecutor() {
        return workflowExecutor();
    }

    /**
     * 异步异常处理器
     */
    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (throwable, method, params) -> {
            log.error("异步任务执行异常 - 方法: {}, 参数: {}", 
                method.getName(), 
                params, 
                throwable);
        };
    }
}
