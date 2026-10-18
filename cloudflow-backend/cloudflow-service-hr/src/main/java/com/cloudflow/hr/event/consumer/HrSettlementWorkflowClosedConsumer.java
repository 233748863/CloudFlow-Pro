package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrSettlementWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HrSettlementWorkflowClosedConsumer implements BusinessEventConsumer {
    private final ObjectMapper json;
    private final HrSettlementWorkflowService service;
    @Override public String eventType() { return HrSettlementWorkflowService.CLOSED_EVENT; }
    @Override public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrSettlementWorkflowService.Closed message = json.readValue(envelope.getPayload(), HrSettlementWorkflowService.Closed.class);
        if (!eventType().equals(envelope.getEventType()) || !"cloudflow-workflow".equals(envelope.getSourceModule())
                || !Objects.equals(envelope.getTenantId(), message.tenantId()) || !Objects.equals(envelope.getSourceId(), message.settlementId())) throw new IllegalArgumentException("结算审批关闭消息身份不一致");
        HrHSupport.runAsTenant(envelope.getTenantId(), () -> service.onClosed(message));
    }
}
