package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.client.dto.WorkflowInvalidateRequest;
import com.cloudflow.hr.service.HrRuleWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@RequiredArgsConstructor
public class HrRuleWorkflowCancelConsumer implements BusinessEventConsumer {
    private final ObjectMapper objectMapper;
    private final HrRuleWorkflowService workflowService;

    @Override
    public String eventType() { return HrRuleWorkflowService.CANCEL_EVENT_TYPE; }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        WorkflowInvalidateRequest request = objectMapper.readValue(envelope.getPayload(), WorkflowInvalidateRequest.class);
        if (!Objects.equals(envelope.getTenantId(), request.getTenantId())
                || !Objects.equals(envelope.getSourceId(), request.getBusinessId()) || !eventType().equals(envelope.getEventType())
                || !"cloudflow-hr".equals(envelope.getSourceModule())) throw new IllegalArgumentException("审批撤回事件身份不匹配");
        com.cloudflow.hr.service.HrHSupport.runAsTenant(envelope.getTenantId(), () -> workflowService.processCancellation(request));
    }
}
