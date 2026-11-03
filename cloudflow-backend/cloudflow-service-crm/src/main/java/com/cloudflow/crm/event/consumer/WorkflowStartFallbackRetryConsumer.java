package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.core.domain.ProcessStartResult;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryPublisher;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
import com.cloudflow.crm.service.impl.CrmApprovalInstanceBinder;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowStartFallbackRetryConsumer implements BusinessEventConsumer {

    private static final String SOURCE_MODULE = "cloudflow-crm";

    private final ObjectMapper objectMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final CrmApprovalInstanceBinder approvalInstances;

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
        String operation = String.valueOf(payload.get("operation"));
        Object request = payload.get("request");
        java.util.concurrent.atomic.AtomicReference<R<ProcessStartResult>> result = new java.util.concurrent.atomic.AtomicReference<>();
        InternalWorkflowStartDTO internalRequest = null;
        if ("startProcess".equals(operation)) {
            WorkflowProcessStartDTO dto = objectMapper.convertValue(request, WorkflowProcessStartDTO.class);
            validateTenant(envelope, payload, dto.getTenantId());
            WorkflowFallbackRetryContext.runRetrying(() -> result.set(remoteWorkflowService.startProcess(dto)));
        } else if ("startProcessInternal".equals(operation)) {
            InternalWorkflowStartDTO dto = objectMapper.convertValue(request, InternalWorkflowStartDTO.class);
            validateTenant(envelope, payload, dto.getTenantId());
            WorkflowFallbackRetryContext.runRetrying(() -> result.set(remoteWorkflowService.startProcessInternal(dto)));
            internalRequest = dto;
        } else throw new IllegalStateException("workflow fallback retry operation is unsupported");
        if (result.get() == null || !result.get().isSuccess() || result.get().getData() == null) {
            throw new IllegalStateException("workflow fallback retry failed: " + (result.get() == null ? "null" : result.get().getMsg()));
        }
        if (internalRequest != null) {
            approvalInstances.bindOpportunityRetry(internalRequest, result.get().getData());
            approvalInstances.bindRefundRetry(internalRequest, result.get().getData());
        }
        log.info("workflow fallback retry success, module={}, operation={}, eventId={}", SOURCE_MODULE, operation, envelope.getEventId());
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
