package com.cloudflow.common.event.workflow;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowFallbackRetryPublisher {

    public static final String EVENT_TYPE = "WORKFLOW_START_FALLBACK_RETRY";

    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    public void publish(String sourceModule, String operation, Object request, Throwable cause) {
        if (WorkflowFallbackRetryContext.isRetrying()) {
            log.warn("skip workflow fallback retry event during retry, sourceModule={}, operation={}", sourceModule, operation);
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sourceModule", sourceModule);
            payload.put("operation", operation);
            payload.put("request", request);
            payload.put("retryFromFallback", true);
            payload.put("cause", cause == null ? null : cause.getClass().getName() + ": " + cause.getMessage());
            outboxPublisher.publish(BusinessEventEnvelope.builder()
                    .eventType(EVENT_TYPE)
                    .sourceModule(sourceModule)
                    .sourceId(resolveSourceId(request))
                    .payload(objectMapper.writeValueAsString(payload))
                    .occurredAt(LocalDateTime.now())
                    .build());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("workflow fallback retry payload serialize failed", e);
        } catch (Exception e) {
            log.error("publish workflow fallback retry event failed, sourceModule={}, operation={}", sourceModule, operation, e);
        }
    }

    private Long resolveSourceId(Object request) {
        if (request == null) {
            return null;
        }
        try {
            Object businessKey = request.getClass().getMethod("getBusinessKey").invoke(request);
            if (businessKey == null) {
                return null;
            }
            String text = String.valueOf(businessKey);
            int idx = text.lastIndexOf(':');
            String id = idx >= 0 ? text.substring(idx + 1) : text;
            return Long.valueOf(id);
        } catch (Exception ignored) {
            return null;
        }
    }
}
