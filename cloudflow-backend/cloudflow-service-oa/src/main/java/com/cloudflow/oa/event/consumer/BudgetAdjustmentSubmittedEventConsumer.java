package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.OaBudgetAdjustment;
import com.cloudflow.oa.event.BudgetAdjustmentSubmittedEvent;
import com.cloudflow.oa.service.impl.OaBudgetServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class BudgetAdjustmentSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaBudgetServiceImpl oaBudgetService;

    @Override
    public String eventType() {
        return "BUDGET_ADJUSTMENT_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        BudgetAdjustmentSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), BudgetAdjustmentSubmittedEvent.class);
        OaBudgetAdjustment adjustment = oaBudgetService.getAdjustmentById(event.getAdjustmentId());
        if (adjustment == null) {
            log.warn("skip budget adjustment workflow start, adjustment not found, adjustmentId={}, eventId={}", event.getAdjustmentId(), envelope.getEventId());
            return;
        }
        if (adjustment.getInstanceId() != null && !adjustment.getInstanceId().isBlank()) {
            log.info("skip budget adjustment workflow start, instance already exists, adjustmentId={}, instanceId={}",
                    adjustment.getAdjustmentId(), adjustment.getInstanceId());
            return;
        }
        oaBudgetService.startAdjustmentWorkflow(adjustment);
    }
}
