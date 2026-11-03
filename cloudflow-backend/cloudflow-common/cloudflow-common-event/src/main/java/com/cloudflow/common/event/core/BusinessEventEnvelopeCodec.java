package com.cloudflow.common.event.core;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Outbox 和事件 Stream 共用唯一的事件对象 JSON；payload 固定为业务 JSON 字符串。 */
public final class BusinessEventEnvelopeCodec {
    private BusinessEventEnvelopeCodec() { }

    public static BusinessEventEnvelope read(String payload, ObjectMapper mapper) throws JsonProcessingException {
        if (payload == null || payload.isBlank()) throw new IllegalArgumentException("business event payload is blank");
        BusinessEventEnvelope envelope = mapper.readerFor(BusinessEventEnvelope.class)
                .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .readValue(payload);
        if (envelope == null) throw new IllegalArgumentException("business event payload must be an object");
        if (envelope.getEventId() == null || envelope.getEventId().isBlank()) {
            throw new IllegalArgumentException("business event eventId is blank");
        }
        if (envelope.getEventType() == null || envelope.getEventType().isBlank()) {
            throw new IllegalArgumentException("business event eventType is blank");
        }
        return envelope;
    }
}
