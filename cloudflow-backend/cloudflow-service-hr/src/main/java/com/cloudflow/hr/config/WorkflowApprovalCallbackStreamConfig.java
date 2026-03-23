package com.cloudflow.hr.config;

import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.hr.listener.WorkflowApprovalCallbackStreamConsumer;
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
 * 审批结果 Redis Stream 订阅配置。
 */
@Configuration
public class WorkflowApprovalCallbackStreamConfig {

    @Bean
    public Subscription workflowApprovalCallbackSubscription(RedisConnectionFactory factory,
                                                             RedisStreamUtil redisStreamUtil,
                                                             WorkflowApprovalCallbackStreamConsumer consumer) {
        // 回调流是 workflow 和 HR 共享的通道，消费组也必须绑定全局 key。
        redisStreamUtil.createGlobalGroup(
                WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY,
                WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_GROUP
        );

        StreamMessageListenerContainer.StreamMessageListenerContainerOptions<String, MapRecord<String, String, String>> options =
                StreamMessageListenerContainer.StreamMessageListenerContainerOptions.builder()
                        .pollTimeout(Duration.ofSeconds(1))
                        .build();

        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container =
                StreamMessageListenerContainer.create(factory, options);

        String consumerName = "hr-callback-" + UUID.randomUUID().toString().substring(0, 8);
        Subscription subscription = container.receive(
                Consumer.from(WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_GROUP, consumerName),
                StreamOffset.create(WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY, ReadOffset.lastConsumed()),
                consumer
        );
        container.start();
        return subscription;
    }
}
