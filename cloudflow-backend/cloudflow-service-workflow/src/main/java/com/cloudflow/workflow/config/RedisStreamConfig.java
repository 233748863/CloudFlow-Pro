package com.cloudflow.workflow.config;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.listener.WorkflowStreamConsumer;
import org.springframework.beans.factory.annotation.Autowired;
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

@Configuration
public class RedisStreamConfig {

    @Autowired
    private RedisStreamUtil redisStreamUtil;

    @Autowired
    private WorkflowProperties workflowProperties;

    @Bean
    public Subscription subscription(RedisConnectionFactory factory, WorkflowStreamConsumer listener) {
        // 1. 确保 Group 存在
        redisStreamUtil.createGroup(workflowProperties.getStream().getKey(), workflowProperties.getStream().getGroup());

        // 2. 配置监听容器
        StreamMessageListenerContainer.StreamMessageListenerContainerOptions<String, MapRecord<String, String, String>> options =
                StreamMessageListenerContainer.StreamMessageListenerContainerOptions.builder()
                        .pollTimeout(Duration.ofSeconds(1))
                        .build();

        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container =
                StreamMessageListenerContainer.create(factory, options);

        // 3. 订阅
        // 使用 UUID 生成唯一消费者名称，防止多实例冲突
        String consumerName = "consumer-" + UUID.randomUUID().toString().substring(0, 8);
        
        Subscription subscription = container.receive(
                Consumer.from(workflowProperties.getStream().getGroup(), consumerName),
                StreamOffset.create(workflowProperties.getStream().getKey(), ReadOffset.lastConsumed()),
                listener
        );

        container.start();
        return subscription;
    }
}
