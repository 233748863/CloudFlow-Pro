package com.cloudflow.common.workflow.callback.config;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.listener.DeadLetterHandler;
import com.cloudflow.common.workflow.callback.listener.DefaultDeadLetterHandler;
import com.cloudflow.common.workflow.callback.listener.WorkflowApprovalCallbackStreamConsumer;
import com.cloudflow.common.workflow.callback.listener.WorkflowCallbackPendingReclaimer;
import com.cloudflow.common.workflow.callback.service.CallbackIdempotentStore;
import com.cloudflow.common.workflow.callback.service.DefaultWorkflowCallbackDispatcher;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.stream.StreamMessageListenerContainer;
import org.springframework.data.redis.stream.Subscription;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * 工作流审批回调自动装配。
 *
 * <p>业务服务通过引入本模块依赖 + yaml 配置 {@code cloudflow.workflow.callback.*}
 * 即可自动获得 Stream 消费容器、订阅 Bean 与 {@link WorkflowCallbackService} 实现。
 *
 * <p>若业务服务自定义了 {@link WorkflowCallbackService} Bean（如 HR），则跳过默认 Dispatcher。
 */
@Slf4j
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "cloudflow.workflow.callback", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(WorkflowCallbackProperties.class)
public class WorkflowCallbackAutoConfiguration {

    /**
     * 没有自定义 {@link WorkflowCallbackService} 且至少存在一个 {@link ApprovalResultHandler} 时，
     * 注册默认 Dispatcher。
     */
    @Bean
    @ConditionalOnMissingBean(WorkflowCallbackService.class)
    @ConditionalOnBean(ApprovalResultHandler.class)
    public WorkflowCallbackService defaultWorkflowCallbackDispatcher(List<ApprovalResultHandler> handlers) {
        return new DefaultWorkflowCallbackDispatcher(handlers);
    }

    @Bean
    @ConditionalOnMissingBean(name = "workflowApprovalCallbackContainer")
    public StreamMessageListenerContainer<String, MapRecord<String, String, String>>
            workflowApprovalCallbackContainer(RedisConnectionFactory factory) {
        StreamMessageListenerContainer.StreamMessageListenerContainerOptions<String, MapRecord<String, String, String>> options =
                StreamMessageListenerContainer.StreamMessageListenerContainerOptions.builder()
                        .pollTimeout(Duration.ofSeconds(1))
                        .build();
        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container =
                StreamMessageListenerContainer.create(factory, options);
        container.start();
        return container;
    }

    @Bean(destroyMethod = "close")
    @ConditionalOnMissingBean(CallbackIdempotentStore.class)
    public CallbackIdempotentStore callbackIdempotentStore(StringRedisTemplate stringRedisTemplate) {
        return new CallbackIdempotentStore(stringRedisTemplate);
    }

    @Bean
    @ConditionalOnMissingBean(DeadLetterHandler.class)
    public DeadLetterHandler defaultDeadLetterHandler(RedisStreamUtil redisStreamUtil) {
        return new DefaultDeadLetterHandler(redisStreamUtil);
    }

    @Bean
    @ConditionalOnMissingBean(WorkflowApprovalCallbackStreamConsumer.class)
    public WorkflowApprovalCallbackStreamConsumer workflowApprovalCallbackStreamConsumer(
            WorkflowCallbackService workflowCallbackService,
            RedisStreamUtil redisStreamUtil,
            WorkflowCallbackProperties properties,
            CallbackIdempotentStore callbackIdempotentStore,
            DeadLetterHandler deadLetterHandler) {
        return new WorkflowApprovalCallbackStreamConsumer(workflowCallbackService, redisStreamUtil, properties,
                callbackIdempotentStore, deadLetterHandler);
    }

    @Bean
    @ConditionalOnMissingBean(name = "workflowApprovalCallbackSubscription")
    public Subscription workflowApprovalCallbackSubscription(
            @Qualifier("workflowApprovalCallbackContainer")
            StreamMessageListenerContainer<String, MapRecord<String, String, String>> workflowApprovalCallbackContainer,
            StringRedisTemplate stringRedisTemplate,
            WorkflowApprovalCallbackStreamConsumer consumer,
            WorkflowCallbackProperties properties) {
        properties.validate();
        try {
            stringRedisTemplate.execute((RedisCallback<String>) connection -> connection.streamCommands().xGroupCreate(
                    stringRedisTemplate.getStringSerializer().serialize(properties.getStreamKey()), properties.getGroup(),
                    ReadOffset.from("0-0"), true));
        } catch (RuntimeException failure) {
            boolean exists = false;
            for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                if (cause.getMessage() != null && cause.getMessage().contains("BUSYGROUP")) exists = true;
            }
            if (!exists) throw failure;
        }

        String consumerName = properties.getConsumerPrefix() + "-" + UUID.randomUUID().toString().substring(0, 8);
        StreamMessageListenerContainer.ConsumerStreamReadRequest<String> request = StreamMessageListenerContainer.StreamReadRequest
                .builder(StreamOffset.create(properties.getStreamKey(), ReadOffset.lastConsumed()))
                .consumer(Consumer.from(properties.getGroup(), consumerName))
                .autoAcknowledge(false)
                .cancelOnError(failure -> false)
                .errorHandler(failure -> retryApprovalCallbackRead(failure, properties))
                .build();
        return workflowApprovalCallbackContainer.register(request, consumer);
    }

    private void retryApprovalCallbackRead(Throwable failure, WorkflowCallbackProperties properties) {
        log.warn("审批回调读取失败，将在1秒后重试: streamKey={}, errorType={}",
                properties.getStreamKey(), failure.getClass().getSimpleName());
        try {
            Thread.sleep(1000);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    @Bean(initMethod = "start", destroyMethod = "close")
    @DependsOn("workflowApprovalCallbackSubscription")
    @ConditionalOnMissingBean(WorkflowCallbackPendingReclaimer.class)
    public WorkflowCallbackPendingReclaimer workflowCallbackPendingReclaimer(StringRedisTemplate stringRedisTemplate,
            WorkflowCallbackProperties properties, WorkflowApprovalCallbackStreamConsumer consumer) {
        return new WorkflowCallbackPendingReclaimer(stringRedisTemplate, properties, consumer);
    }
}
