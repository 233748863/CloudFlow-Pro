package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.event.KnowledgeDocumentSubmittedEvent;
import com.cloudflow.oa.service.impl.KnowledgeServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class KnowledgeDocumentSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final KnowledgeServiceImpl knowledgeService;

    @Override
    public String eventType() {
        return "KNOWLEDGE_DOCUMENT_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        KnowledgeDocumentSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), KnowledgeDocumentSubmittedEvent.class);
        KnowledgeDocument document = knowledgeService.getById(event.getDocumentId());
        if (document == null) {
            log.warn("skip knowledge workflow start, document not found, documentId={}, eventId={}", event.getDocumentId(), envelope.getEventId());
            return;
        }
        if (document.getInstanceId() != null && !document.getInstanceId().isBlank()) {
            log.info("skip knowledge workflow start, instance already exists, documentId={}, instanceId={}",
                    document.getDocumentId(), document.getInstanceId());
            return;
        }
        knowledgeService.startPublishWorkflow(document);
    }
}
