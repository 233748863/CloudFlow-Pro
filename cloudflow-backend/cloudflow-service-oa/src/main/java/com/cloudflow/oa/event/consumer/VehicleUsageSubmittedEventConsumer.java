package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.event.VehicleUsageSubmittedEvent;
import com.cloudflow.oa.service.impl.VehicleUsageServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class VehicleUsageSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final VehicleUsageServiceImpl vehicleUsageService;

    @Override
    public String eventType() {
        return "VEHICLE_USAGE_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        VehicleUsageSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), VehicleUsageSubmittedEvent.class);
        VehicleUsage usage = vehicleUsageService.getById(event.getUsageId());
        if (usage == null) {
            log.warn("skip vehicle usage workflow start, usage not found, usageId={}, eventId={}", event.getUsageId(), envelope.getEventId());
            return;
        }
        if (usage.getProcessInstanceId() != null && !usage.getProcessInstanceId().isBlank()) {
            log.info("skip vehicle usage workflow start, instance already exists, usageId={}, instanceId={}",
                    usage.getUsageId(), usage.getProcessInstanceId());
            return;
        }
        vehicleUsageService.startVehicleWorkflow(usage);
    }
}
