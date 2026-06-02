package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.OaBudgetPlan;
import com.cloudflow.oa.event.BudgetPlanSubmittedEvent;
import com.cloudflow.oa.service.impl.OaBudgetServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class BudgetPlanSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaBudgetServiceImpl oaBudgetService;

    @Override
    public String eventType() {
        return "BUDGET_PLAN_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        BudgetPlanSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), BudgetPlanSubmittedEvent.class);
        OaBudgetPlan budget = oaBudgetService.getById(event.getBudgetId());
        if (budget == null) {
            log.warn("skip budget workflow start, budget not found, budgetId={}, eventId={}", event.getBudgetId(), envelope.getEventId());
            return;
        }
        if (budget.getInstanceId() != null && !budget.getInstanceId().isBlank()) {
            log.info("skip budget workflow start, instance already exists, budgetId={}, instanceId={}",
                    budget.getBudgetId(), budget.getInstanceId());
            return;
        }
        oaBudgetService.startBudgetWorkflow(budget);
    }
}
