package com.cloudflow.workflow.config;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.workflow.listener.HrEmployeeLeftStreamConsumer;
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
public class HrEventStreamConfig {

    @Bean
    public StreamMessageListenerContainer<String, MapRecord<String, String, String>> hrEmployeeLeftContainer(
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
    public Subscription hrEmployeeLeftSubscription(
            StreamMessageListenerContainer<String, MapRecord<String, String, String>> hrEmployeeLeftContainer,
            RedisStreamUtil redisStreamUtil,
            HrEmployeeLeftStreamConsumer consumer) {
        redisStreamUtil.createGlobalGroup(
                HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY,
                HrEventStreamConstants.EMPLOYEE_LEFT_GROUP);

        String consumerName = "workflow-hr-left-" + UUID.randomUUID().toString().substring(0, 8);
        return hrEmployeeLeftContainer.receive(
                Consumer.from(HrEventStreamConstants.EMPLOYEE_LEFT_GROUP, consumerName),
                StreamOffset.create(HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY, ReadOffset.lastConsumed()),
                consumer);
    }
}
