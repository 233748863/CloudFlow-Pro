package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.event.CrmQuoteSubmittedEvent;
import com.cloudflow.crm.service.impl.CrmQuoteServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class CrmQuoteSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final CrmQuoteServiceImpl quoteService;

    @Override
    public String eventType() {
        return "CRM_QUOTE_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        CrmQuoteSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), CrmQuoteSubmittedEvent.class);
        CrmQuote quote = quoteService.getById(event.getQuoteId());
        if (quote == null) {
            log.warn("skip crm quote workflow start, quote not found, quoteId={}, eventId={}",
                    event.getQuoteId(), envelope.getEventId());
            return;
        }
        if (quote.getInstanceId() != null && !quote.getInstanceId().isBlank()) {
            log.info("skip crm quote workflow start, instance already exists, quoteId={}, instanceId={}",
                    quote.getQuoteId(), quote.getInstanceId());
            return;
        }
        quoteService.startQuoteWorkflow(quote);
    }
}
