package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.service.HrHEventService;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrOvertimeSettlementService;
import com.cloudflow.hr.service.HrShiftRequestService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Objects;

abstract class HrHExecutionConsumer implements BusinessEventConsumer {
    protected void execute(BusinessEventEnvelope envelope, ObjectMapper mapper, java.util.function.BiConsumer<Long, Integer> action) throws Exception {
        JsonNode payload = mapper.readTree(envelope.getPayload());
        Long tenantId = HrHSupport.number(payload.path("tenantId").asText()); Long requestId = HrHSupport.number(payload.path("requestId").asText());
        if (!eventType().equals(envelope.getEventType()) || !"cloudflow-hr".equals(envelope.getSourceModule()) || !Objects.equals(envelope.getTenantId(), tenantId)
                || !Objects.equals(envelope.getSourceId(), requestId) || requestId == null || requestId <= 0 || !payload.path("version").canConvertToInt() || payload.path("version").intValue() < 0) {
            throw new IllegalArgumentException("H业务事件身份或版本不匹配");
        }
        HrHSupport.runAsTenant(tenantId, () -> action.accept(requestId, payload.path("version").intValue()));
    }
}

@Component
@RequiredArgsConstructor
class HrOvertimeSettleConsumer extends HrHExecutionConsumer {
    private final ObjectMapper mapper;
    private final HrOvertimeSettlementService service;
    @Override public String eventType() { return HrHEventService.OVERTIME_SETTLE; }
    @Override public void consume(BusinessEventEnvelope envelope) throws Exception { execute(envelope, mapper, service::settle); }
}

@Component
@RequiredArgsConstructor
class HrShiftRequestApplyConsumer extends HrHExecutionConsumer {
    private final ObjectMapper mapper;
    private final HrShiftRequestService service;
    @Override public String eventType() { return HrHEventService.SHIFT_APPLY; }
    @Override public void consume(BusinessEventEnvelope envelope) throws Exception { execute(envelope, mapper, service::apply); }
}
