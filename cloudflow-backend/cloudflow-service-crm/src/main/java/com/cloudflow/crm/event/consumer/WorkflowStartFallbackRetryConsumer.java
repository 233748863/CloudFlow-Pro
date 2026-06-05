package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryPublisher;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
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
        final R<?>[] result = new R<?>[1];
        WorkflowFallbackRetryContext.runRetrying(() -> result[0] = "startProcess".equals(operation)
                ? remoteWorkflowService.startProcess(objectMapper.convertValue(request, WorkflowProcessStartDTO.class))
                : remoteWorkflowService.startProcessInternal(objectMapper.convertValue(request, InternalWorkflowStartDTO.class)));
        if (result[0] == null || !result[0].isSuccess()) {
            throw new IllegalStateException("workflow fallback retry failed: " + (result[0] == null ? "null" : result[0].getMsg()));
        }
        log.info("workflow fallback retry success, module={}, operation={}, eventId={}", SOURCE_MODULE, operation, envelope.getEventId());
    }
}
