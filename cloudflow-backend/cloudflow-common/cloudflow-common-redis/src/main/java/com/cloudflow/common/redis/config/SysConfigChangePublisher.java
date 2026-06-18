package com.cloudflow.common.redis.config;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SysConfigChangePublisher {

    private final StringRedisTemplate stringRedisTemplate;

    public void publish(SysConfigChangeEvent event) {
        stringRedisTemplate.convertAndSend(SysConfigKeys.CONFIG_CHANGE_CHANNEL, event.encode());
    }
}
