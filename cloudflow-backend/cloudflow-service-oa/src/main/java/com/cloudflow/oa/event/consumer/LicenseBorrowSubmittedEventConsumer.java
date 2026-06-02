package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.event.LicenseBorrowSubmittedEvent;
import com.cloudflow.oa.service.impl.OaLicenseBorrowServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class LicenseBorrowSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaLicenseBorrowServiceImpl licenseBorrowService;

    @Override
    public String eventType() {
        return "LICENSE_BORROW_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        LicenseBorrowSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), LicenseBorrowSubmittedEvent.class);
        OaLicenseBorrow borrow = licenseBorrowService.getById(event.getBorrowId());
        if (borrow == null) {
            log.warn("skip license borrow workflow start, borrow not found, borrowId={}, eventId={}", event.getBorrowId(), envelope.getEventId());
            return;
        }
        if (borrow.getInstanceId() != null && !borrow.getInstanceId().isBlank()) {
            log.info("skip license borrow workflow start, instance already exists, borrowId={}, instanceId={}",
                    borrow.getId(), borrow.getInstanceId());
            return;
        }
        licenseBorrowService.startBorrowWorkflow(borrow);
    }
}
