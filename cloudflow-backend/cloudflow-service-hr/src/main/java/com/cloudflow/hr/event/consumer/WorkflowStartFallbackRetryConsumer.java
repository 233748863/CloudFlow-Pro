package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryPublisher;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.WorkflowStartRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowStartFallbackRetryConsumer implements BusinessEventConsumer {

    private static final String SOURCE_MODULE = "cloudflow-hr";

    private final ObjectMapper objectMapper;
    private final WorkflowServiceClient workflowServiceClient;

    @Override
    public String eventType() {
        return WorkflowFallbackRetryPublisher.EVENT_TYPE;
    }

    @Override
    @SuppressWarnings("unchecked")
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        Map<String, Object> payload = objectMapper.readValue(envelope.getPayload(), Map.class);
        if (!SOURCE_MODULE.equals(payload.get("sourceModule"))) {
            return;
        }
        WorkflowStartRequest request = objectMapper.convertValue(payload.get("request"), WorkflowStartRequest.class);
        validateTenant(envelope, payload, request.getTenantId());
        final R<?>[] result = new R<?>[1];
        WorkflowFallbackRetryContext.runRetrying(() -> result[0] = workflowServiceClient.startProcessInternal(request));
        if (result[0] == null || !result[0].isSuccess()) {
            throw new IllegalStateException("workflow fallback retry failed: " + (result[0] == null ? "null" : result[0].getMsg()));
        }
        log.info("workflow fallback retry success, module={}, eventId={}", SOURCE_MODULE, envelope.getEventId());
    }

    private void validateTenant(BusinessEventEnvelope envelope, Map<String, Object> payload, Long requestTenantId) {
        Long payloadTenantId = parseTenantId(payload.get("tenantId"));
        Long contextTenantId = UserContext.getTenantId();
        if (requestTenantId == null || envelope.getTenantId() == null || contextTenantId == null
                || !requestTenantId.equals(envelope.getTenantId())
                || !requestTenantId.equals(payloadTenantId)
                || !requestTenantId.equals(contextTenantId)) {
            throw new IllegalStateException("workflow fallback retry tenantId mismatch");
        }
    }

    private Long parseTenantId(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }
}
