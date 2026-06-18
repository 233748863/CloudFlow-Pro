package com.cloudflow.common.redis.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Slf4j
@Configuration
public class SysConfigChangeListenerConfiguration {

    @Bean
    public RedisMessageListenerContainer sysConfigChangeListenerContainer(
            RedisConnectionFactory connectionFactory,
            ObjectProvider<List<SysConfigChangeListener>> listenerProvider) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener((message, pattern) -> {
            String body = new String(message.getBody(), StandardCharsets.UTF_8);
            SysConfigChangeEvent event = SysConfigChangeEvent.decode(body);
            for (SysConfigChangeListener listener : listenerProvider.getIfAvailable(List::of)) {
                try {
                    listener.onSysConfigChanged(event);
                } catch (Exception e) {
                    log.warn("处理系统配置变更失败: key={}, listener={}", event.configKey(), listener.getClass().getName(), e);
                }
            }
        }, ChannelTopic.of(SysConfigKeys.CONFIG_CHANGE_CHANNEL));
        return container;
    }
}
