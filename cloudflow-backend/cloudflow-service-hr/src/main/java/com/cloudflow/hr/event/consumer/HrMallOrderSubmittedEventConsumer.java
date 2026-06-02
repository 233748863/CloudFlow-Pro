package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrMallOrder;
import com.cloudflow.hr.event.HrMallOrderSubmittedEvent;
import com.cloudflow.hr.mapper.HrMallOrderMapper;
import com.cloudflow.hr.service.impl.HrMallOrderServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrMallOrderSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrMallOrderMapper orderMapper;
    private final HrMallOrderServiceImpl mallOrderService;

    @Override
    public String eventType() {
        return "HR_MALL_ORDER_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrMallOrderSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrMallOrderSubmittedEvent.class);
        HrMallOrder order = orderMapper.selectById(event.getOrderId());
        if (order == null) {
            log.warn("skip hr mall order workflow start, order not found, orderId={}, eventId={}", event.getOrderId(), envelope.getEventId());
            return;
        }
        if (order.getProcessInstanceId() != null && !order.getProcessInstanceId().isBlank()) {
            log.info("skip hr mall order workflow start, instance already exists, orderId={}, instanceId={}",
                    order.getId(), order.getProcessInstanceId());
            return;
        }
        mallOrderService.startMallOrderWorkflow(order);
    }
}
