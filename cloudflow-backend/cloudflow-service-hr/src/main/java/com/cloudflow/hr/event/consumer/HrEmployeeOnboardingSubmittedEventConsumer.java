package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.service.HrEmployeeOnboardingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@RequiredArgsConstructor
public class HrEmployeeOnboardingSubmittedEventConsumer implements BusinessEventConsumer {
    private final ObjectMapper objectMapper;
    private final HrEmployeeOnboardingService onboardingService;

    @Override
    public String eventType() {
        return HrEmployeeOnboardingService.SUBMITTED_EVENT;
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        ProcessStartDTO request = objectMapper.readValue(envelope.getPayload(), ProcessStartDTO.class);
        if (request == null || !"cloudflow-hr".equals(envelope.getSourceModule())
                || envelope.getSourceId() == null || envelope.getTenantId() == null
                || !Objects.equals(envelope.getSourceId(), request.getBusinessId())
                || !Objects.equals(envelope.getTenantId(), request.getTenantId())) {
            throw new IllegalArgumentException("入职审批事件的业务标识或租户不匹配");
        }
        onboardingService.startPersistedWorkflow(request);
    }
}
