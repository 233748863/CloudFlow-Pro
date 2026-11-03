package com.cloudflow.auth.event.consumer;

import com.cloudflow.auth.service.remote.InternalWorkflowStartDTO;
import com.cloudflow.auth.service.remote.RemoteWorkflowService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.ProcessStartResult;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowStartFallbackRetryConsumer implements BusinessEventConsumer {

    private static final String SOURCE_MODULE = "cloudflow-auth";

    private final ObjectMapper objectMapper;
    private final RemoteWorkflowService remoteWorkflowService;

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
        InternalWorkflowStartDTO request = objectMapper.convertValue(payload.get("request"), InternalWorkflowStartDTO.class);
        validateTenant(envelope, payload, request.getTenantId());
        AtomicReference<R<ProcessStartResult>> result = new AtomicReference<>();
        WorkflowFallbackRetryContext.runRetrying(() -> result.set(remoteWorkflowService.startProcessInternal(request)));
        R<ProcessStartResult> response = result.get();
        if (response == null || !response.isSuccess() || response.getData() == null) {
            throw new IllegalStateException("workflow fallback retry failed: " + (response == null ? "null" : response.getMsg()));
        }
        response.getData().requireInstanceId();
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
