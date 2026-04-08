package com.cloudflow.oa.config;

import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.oa.listener.WorkflowApprovalCallbackStreamConsumer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.stream.StreamMessageListenerContainer;
import org.springframework.data.redis.stream.Subscription;

import java.time.Duration;
import java.util.UUID;

/**
 * OA 审批结果 Redis Stream 订阅配置。
 */
@Configuration
public class WorkflowApprovalCallbackStreamConfig {

    @Bean
    public StreamMessageListenerContainer<String, MapRecord<String, String, String>> workflowApprovalCallbackContainer(
            RedisConnectionFactory factory) {
        StreamMessageListenerContainer.StreamMessageListenerContainerOptions<String, MapRecord<String, String, String>> options =
                StreamMessageListenerContainer.StreamMessageListenerContainerOptions.builder()
                        .pollTimeout(Duration.ofSeconds(1))
                        .build();

        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container =
                StreamMessageListenerContainer.create(factory, options);
        container.start();
        return container;
    }

    @Bean
    public Subscription workflowApprovalCallbackSubscription(
            StreamMessageListenerContainer<String, MapRecord<String, String, String>> workflowApprovalCallbackContainer,
            RedisStreamUtil redisStreamUtil,
            WorkflowApprovalCallbackStreamConsumer consumer) {
        // OA 使用独立 Stream 与消费组，避免与其他业务服务共享消息堆积面。
        redisStreamUtil.createGlobalGroup(
                WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY,
                WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_GROUP
        );

        String consumerName = "oa-callback-" + UUID.randomUUID().toString().substring(0, 8);
        return workflowApprovalCallbackContainer.receive(
                Consumer.from(WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_GROUP, consumerName),
                StreamOffset.create(WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY, ReadOffset.lastConsumed()),
                consumer
        );
    }
}
