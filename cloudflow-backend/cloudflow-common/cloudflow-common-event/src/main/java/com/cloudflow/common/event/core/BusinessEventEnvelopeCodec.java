package com.cloudflow.common.event.core;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public final class BusinessEventEnvelopeCodec {
    private BusinessEventEnvelopeCodec() { }

    public static BusinessEventEnvelope read(String rawPayload, ObjectMapper mapper) throws JsonProcessingException {
        if (rawPayload == null || rawPayload.isBlank()) throw new IllegalArgumentException("business event payload is blank");
        JsonNode node = mapper.readTree(rawPayload);
        if (node != null && node.isTextual()) {
            String nested = node.asText();
            if (nested == null || nested.isBlank()) throw new IllegalArgumentException("business event payload text is blank");
            node = mapper.readTree(nested);
        }
        if (node == null || !node.isObject()) throw new IllegalArgumentException("business event payload must be a JSON object");
        BusinessEventEnvelope envelope = new BusinessEventEnvelope();
        envelope.setEventId(text(node, "eventId")); envelope.setEventType(text(node, "eventType"));
        envelope.setSourceModule(text(node, "sourceModule")); envelope.setSourceId(identifier(node, "sourceId"));
        envelope.setTenantId(identifier(node, "tenantId")); envelope.setPayloadDigest(text(node, "payloadDigest"));
        JsonNode payload = node.get("payload");
        envelope.setPayload(payload == null || payload.isNull() ? null : payload.isTextual() ? payload.asText() : mapper.writeValueAsString(payload));
        String occurredAt = text(node, "occurredAt");
        envelope.setOccurredAt(occurredAt == null || occurredAt.isBlank() ? null : timestamp(occurredAt));
        if (envelope.getEventId() == null || envelope.getEventId().isBlank()) throw new IllegalArgumentException("business event eventId is blank");
        if (envelope.getEventType() == null || envelope.getEventType().isBlank()) throw new IllegalArgumentException("business event eventType is blank");
        return envelope;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static Long identifier(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || value.isTextual() && value.asText().isBlank() ? null : value.asLong();
    }

    private static LocalDateTime timestamp(String value) {
        String normalized = value.trim();
        try { return LocalDateTime.parse(normalized, DateTimeFormatter.ISO_LOCAL_DATE_TIME); }
        catch (DateTimeParseException ignored) { }
        try { return OffsetDateTime.parse(normalized, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toLocalDateTime(); }
        catch (DateTimeParseException ignored) { }
        try { return LocalDateTime.parse(normalized, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")); }
        catch (DateTimeParseException failure) { throw new IllegalArgumentException("business event occurredAt is invalid: " + normalized, failure); }
    }
}
