package com.cloudflow.crm.config;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.crm.listener.CrmSelfEventStreamConsumer;
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
 * CRM 自订阅全局 {@code crm:stream:events}。
 */
@Configuration
public class CrmSelfEventStreamConfig {

    @Bean
    public StreamMessageListenerContainer<String, MapRecord<String, String, String>> crmSelfEventContainer(
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
    public Subscription crmSelfEventSubscription(
            StreamMessageListenerContainer<String, MapRecord<String, String, String>> crmSelfEventContainer,
            RedisStreamUtil redisStreamUtil,
            CrmSelfEventStreamConsumer consumer) {
        redisStreamUtil.createGlobalGroup(
                CrmEventStreamConstants.CRM_EVENTS_STREAM_KEY,
                CrmEventStreamConstants.SELF_CONSUMER_GROUP);
        String consumerName = "crm-self-" + UUID.randomUUID().toString().substring(0, 8);
        return crmSelfEventContainer.receive(
                Consumer.from(CrmEventStreamConstants.SELF_CONSUMER_GROUP, consumerName),
                StreamOffset.create(CrmEventStreamConstants.CRM_EVENTS_STREAM_KEY, ReadOffset.lastConsumed()),
                consumer);
    }
}
