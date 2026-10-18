package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.service.HrRuleWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HrRuleWorkflowStartConsumer implements BusinessEventConsumer {
    private final ObjectMapper objectMapper;
    private final HrRuleWorkflowService workflowService;
    @Override
    public String eventType() { return HrRuleWorkflowService.EVENT_TYPE; }
    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        ProcessStartDTO request = objectMapper.readValue(envelope.getPayload(), ProcessStartDTO.class);
        if (!java.util.Objects.equals(envelope.getTenantId(), request.getTenantId())
                || !java.util.Objects.equals(envelope.getSourceId(), request.getBusinessId()) || !eventType().equals(envelope.getEventType())
                || !"cloudflow-hr".equals(envelope.getSourceModule())) throw new IllegalArgumentException("审批事件身份不匹配");
        com.cloudflow.hr.service.HrHSupport.runAsTenant(envelope.getTenantId(), () -> workflowService.start(request));
    }
}
