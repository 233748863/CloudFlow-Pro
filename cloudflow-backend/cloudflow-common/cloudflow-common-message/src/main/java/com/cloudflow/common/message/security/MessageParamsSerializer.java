package com.cloudflow.common.message.security;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.util.Map;

public final class MessageParamsSerializer extends JsonSerializer<Map<String, Object>> {
    @Override
    public void serialize(Map<String, Object> params, JsonGenerator generator, SerializerProvider provider) throws IOException {
        boolean internal = Boolean.TRUE.equals(provider.getAttribute("cloudflow.message.internal-payload"));
        generator.writeStartObject();
        for (Map.Entry<String, Object> entry : params.entrySet()) {
            if (!internal && "imTodoCardKey".equals(entry.getKey())) continue;
            generator.writeFieldName(entry.getKey());
            provider.defaultSerializeValue(entry.getValue(), generator);
        }
        generator.writeEndObject();
    }
}
