package cn.joywon.poco.common.sensitive.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

import java.util.Optional;

@Configuration
public class ListenerContainerOptional {

    @Bean("redisMessageListenerContainerOptional")
    public Optional<RedisMessageListenerContainer> optional(RedisConnectionFactory factory) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        return Optional.of(container);
    }

}