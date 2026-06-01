package com.cloudflow.common.event.core;

import com.cloudflow.common.redis.core.RedisStreamUtil;

import java.util.HashMap;
import java.util.Map;

/**
 * 通用死信发布器。
 */
public class DeadLetterPublisher {

    private final RedisStreamUtil redisStreamUtil;
    private final String dlqStreamKey;

    public DeadLetterPublisher(RedisStreamUtil redisStreamUtil, String dlqStreamKey) {
        this.redisStreamUtil = redisStreamUtil;
        this.dlqStreamKey = dlqStreamKey;
    }

    public void publish(BusinessEventEnvelope envelope, String lastError, int retryCount) {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", envelope.getEventId());
        body.put("eventType", envelope.getEventType());
        body.put("payload", envelope.getPayload());
        body.put("tenantId", envelope.getTenantId());
        body.put("sourceId", envelope.getSourceId());
        body.put("sourceModule", envelope.getSourceModule());
        body.put("lastError", lastError);
        body.put("retryCount", retryCount);
        redisStreamUtil.publishGlobal(dlqStreamKey, body);
    }
}
