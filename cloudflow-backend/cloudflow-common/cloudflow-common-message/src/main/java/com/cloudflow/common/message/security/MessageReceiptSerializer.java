package com.cloudflow.common.message.security;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.util.Map;

public final class MessageReceiptSerializer extends JsonSerializer<Map<String, String>> {
    @Override
    public void serialize(Map<String, String> receipt, JsonGenerator generator, SerializerProvider provider) throws IOException {
        generator.writeStartObject();
        if (Boolean.TRUE.equals(provider.getAttribute("cloudflow.message.internal-payload"))) {
            for (Map.Entry<String, String> entry : receipt.entrySet()) generator.writeStringField(entry.getKey(), entry.getValue());
        }
        generator.writeEndObject();
    }
}
