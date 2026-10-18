package com.cloudflow.workflow.domain;

import com.cloudflow.workflow.service.WorkflowHistoryState;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;
import java.util.Map;

public class WorkflowHistoryMetadataSerializer extends JsonSerializer<String> {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public void serialize(String value, JsonGenerator output, SerializerProvider serializers) throws IOException {
        Map<String, Object> metadata = WorkflowHistoryState.metadata(value);
        metadata.keySet().removeIf(key -> key.startsWith("_wf_"));
        output.writeString(JSON.writeValueAsString(metadata));
    }
}
