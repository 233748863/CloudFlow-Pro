package com.cloudflow.workflow.callback;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.workflow.callback.listener.DefaultDeadLetterHandler;
import com.cloudflow.workflow.domain.WfCallbackDeadLetter;
import com.cloudflow.workflow.mapper.WfCallbackDeadLetterMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.stream.StreamListener;
import org.springframework.data.redis.stream.StreamMessageListenerContainer;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class CallbackDlqStreamConsumer implements StreamListener<String, MapRecord<String, String, String>> {

    private static final String DLQ_GROUP = "group:workflow:dlq-recorder";

    private final WfCallbackDeadLetterMapper deadLetterMapper;
    private final ObjectMapper objectMapper;
    private final RedisStreamUtil redisStreamUtil;
    private final RedisConnectionFactory redisConnectionFactory;

    @PostConstruct
    public void start() {
        StreamMessageListenerContainer.StreamMessageListenerContainerOptions<String, MapRecord<String, String, String>> options =
                StreamMessageListenerContainer.StreamMessageListenerContainerOptions.builder()
                        .pollTimeout(Duration.ofSeconds(1))
                        .build();
        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container =
                StreamMessageListenerContainer.create(redisConnectionFactory, options);

        redisStreamUtil.createGlobalGroup(DefaultDeadLetterHandler.DLQ_STREAM_KEY, DLQ_GROUP);
        String consumerName = "dlq-recorder-" + UUID.randomUUID().toString().substring(0, 8);
        container.receive(
                Consumer.from(DLQ_GROUP, consumerName),
                StreamOffset.create(DefaultDeadLetterHandler.DLQ_STREAM_KEY, ReadOffset.lastConsumed()),
                this);
        container.start();
    }

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = new HashMap<>(message.getValue());
        try {
            String streamKey = strip(body.remove("__streamKey"));
            String processInstanceId = strip(body.remove("__processInstanceId"));
            int retryCount = parseInt(strip(body.remove("__retryCount")));
            String lastError = strip(body.remove("__lastError"));
            Long tenantId = parseLong(strip(body.get("tenantId")));

            // DLQ 表已在 ignore-tables 中（MP 不强制 WHERE tenant_id），
            // 但仍走 TenantBroker 包裹消费线程，确保任何下游 SQL（如同事务里
            // 其他业务表 JOIN）继承租户上下文，且符合"所有 Stream 消费者入口走 broker"红线。
            TenantBroker.runAs(tenantId, tid -> {
                try {
                    WfCallbackDeadLetter dlq = new WfCallbackDeadLetter();
                    dlq.setTenantId(tenantId);
                    dlq.setStreamKey(streamKey);
                    dlq.setProcessInstanceId(processInstanceId);
                    dlq.setBusinessType(strip(body.get("businessType")));
                    dlq.setBusinessId(parseLong(strip(body.get("businessId"))));
                    dlq.setPayloadJson(objectMapper.writeValueAsString(body));
                    dlq.setRetryCount(retryCount);
                    dlq.setLastError(lastError);
                    dlq.setStatus("PENDING");
                    dlq.setCreateTime(LocalDateTime.now());
                    dlq.setUpdateTime(LocalDateTime.now());
                    deadLetterMapper.insert(dlq);
                } catch (com.fasterxml.jackson.core.JsonProcessingException jpe) {
                    throw new IllegalStateException("DLQ payload 序列化失败", jpe);
                }
            });

            redisStreamUtil.ackGlobal(DefaultDeadLetterHandler.DLQ_STREAM_KEY, DLQ_GROUP, msgId);
            redisStreamUtil.deleteGlobal(DefaultDeadLetterHandler.DLQ_STREAM_KEY, msgId);
            log.warn("[DLQ] 死信入库: processInstanceId={}, streamKey={}, tenantId={}",
                    processInstanceId, streamKey, tenantId);
        } catch (Exception e) {
            log.error("[DLQ] 死信消费失败: msgId={}", msgId, e);
        }
    }

    private String strip(String v) {
        if (v == null) return null;
        String s = v.trim();
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
            s = s.substring(1, s.length() - 1);
        }
        return s;
    }

    private int parseInt(String v) {
        if (v == null || v.isBlank()) return 0;
        try { return Integer.parseInt(v); } catch (NumberFormatException e) { return 0; }
    }

    private Long parseLong(String v) {
        if (v == null || v.isBlank()) return null;
        try { return Long.parseLong(v); } catch (NumberFormatException e) { return null; }
    }
}
