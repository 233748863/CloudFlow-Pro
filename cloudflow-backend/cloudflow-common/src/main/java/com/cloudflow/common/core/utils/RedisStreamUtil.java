package com.cloudflow.common.core.utils;

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
     * 创建消费者组 (如果不存在)
     */
    public void createGroup(String key, String group) {
        String tenantKey = getTenantKey(key);
        try {
            // 尝试创建组，从最新的消息开始消费 ($)
            // 注意：如果 Stream 不存在，mkStream=true 会自动创建
            redisTemplate.opsForStream().createGroup(tenantKey, group);
        } catch (Exception e) {
            // BUSYGROUP Consumer Group name already exists
            // Spring Data Redis 可能会抛出异常，需捕获忽略
            if (e.getMessage() != null && e.getMessage().contains("BUSYGROUP")) {
                log.debug("Consumer Group already exists: {}", group);
            } else {
                // 如果是因为 Stream 不存在导致无法创建 Group (Redis < 5.0 behavior, though 7.0 should support MKSTREAM implicit in some clients)
                // Spring Data Redis 的 createGroup 默认行为可能不同，稳妥起见我们只记录警告
                log.warn("Failed to create consumer group. Key: {}, Group: {}", tenantKey, group, e);
            }
        }
    }

    /**
     * 发布消息到 Stream
     *
     * @param key     Stream Key
     * @param content 消息体 (Map)
     * @return 消息ID
     */
    public String publish(String key, Map<String, Object> content) {
        RecordId recordId = redisTemplate.opsForStream().add(MapRecord.create(getTenantKey(key), content));
        return recordId != null ? recordId.getValue() : null;
    }

    /**
     * 确认消息 (ACK)
     *
     * @param key       Stream Key
     * @param group     Consumer Group
     * @param recordIds 消息ID列表
     * @return 成功确认的数量
     */
    public Long ack(String key, String group, String... recordIds) {
        return redisTemplate.opsForStream().acknowledge(getTenantKey(key), group, recordIds);
    }

    /**
     * 删除消息 (物理删除)
     */
    public Long delete(String key, String... recordIds) {
        return redisTemplate.opsForStream().delete(getTenantKey(key), recordIds);
    }
}
