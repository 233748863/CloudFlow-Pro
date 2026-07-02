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

    public void publishRaw(String streamMsgId,
                           String streamKey,
                           String consumerGroup,
                           Map<String, String> rawBody,
                           String lastError,
                           int retryCount) {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", rawBody != null ? rawBody.getOrDefault("eventId", "unknown") : "unknown");
        body.put("eventType", rawBody != null ? rawBody.getOrDefault("eventType", "UNKNOWN") : "UNKNOWN");
        body.put("payload", rawBody != null ? rawBody.get("payload") : null);
        body.put("tenantId", rawBody != null ? rawBody.get("tenantId") : null);
        body.put("sourceModule", "raw-stream");
        body.put("sourceId", null);
        body.put("streamMsgId", streamMsgId);
        body.put("streamKey", streamKey);
        body.put("consumerGroup", consumerGroup);
        body.put("rawEventId", rawBody != null ? rawBody.get("eventId") : null);
        body.put("rawEventType", rawBody != null ? rawBody.get("eventType") : null);
        body.put("lastError", lastError);
        body.put("retryCount", retryCount);
        redisStreamUtil.publishGlobal(dlqStreamKey, body);
    }
}
