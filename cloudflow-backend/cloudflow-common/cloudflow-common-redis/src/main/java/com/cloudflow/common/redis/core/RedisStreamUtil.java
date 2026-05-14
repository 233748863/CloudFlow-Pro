package com.cloudflow.common.redis.core;

import com.cloudflow.common.core.context.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class RedisStreamUtil {
    private static final Logger log = LoggerFactory.getLogger(RedisStreamUtil.class);

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    private String getTenantKey(String key) {
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            return tenantId + ":" + key;
        }
        return key;
    }

    /**
     * 跨服务事件流必须固定使用原始 key，避免生产者和消费者因为租户上下文不一致而落到不同 Stream。
     */
    private String getGlobalKey(String key) {
        return key;
    }

    /**
     * 创建消费组，默认沿用当前租户前缀。
     */
    public void createGroup(String key, String group) {
        createGroupInternal(getTenantKey(key), group);
    }

    /**
     * 创建全局消费组，不拼租户前缀。
     */
    public void createGlobalGroup(String key, String group) {
        createGroupInternal(getGlobalKey(key), group);
    }

    private void createGroupInternal(String streamKey, String group) {
        try {
            redisTemplate.opsForStream().createGroup(streamKey, group);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("BUSYGROUP")) {
                log.debug("消费组已存在: {}", group);
            } else {
                log.warn("创建消费组失败, key={}, group={}", streamKey, group, e);
            }
        }
    }

    /**
     * 发布消息到租户隔离 Stream。
     */
    public String publish(String key, Map<String, Object> content) {
        return publishInternal(getTenantKey(key), content);
    }

    /**
     * 发布消息到全局 Stream，不拼租户前缀。
     */
    public String publishGlobal(String key, Map<String, Object> content) {
        return publishInternal(getGlobalKey(key), content);
    }

    private String publishInternal(String streamKey, Map<String, Object> content) {
        RecordId recordId = redisTemplate.opsForStream().add(MapRecord.create(streamKey, content));
        return recordId != null ? recordId.getValue() : null;
    }

    /**
     * 确认租户隔离 Stream 消息。
     */
    public Long ack(String key, String group, String... recordIds) {
        return redisTemplate.opsForStream().acknowledge(getTenantKey(key), group, recordIds);
    }

    /**
     * 确认全局 Stream 消息，不拼租户前缀。
     */
    public Long ackGlobal(String key, String group, String... recordIds) {
        return redisTemplate.opsForStream().acknowledge(getGlobalKey(key), group, recordIds);
    }

    /**
     * 删除租户隔离 Stream 消息。
     */
    public Long delete(String key, String... recordIds) {
        return redisTemplate.opsForStream().delete(getTenantKey(key), recordIds);
    }

    /**
     * 删除全局 Stream 消息，不拼租户前缀。
     */
    public Long deleteGlobal(String key, String... recordIds) {
        return redisTemplate.opsForStream().delete(getGlobalKey(key), recordIds);
    }
}
