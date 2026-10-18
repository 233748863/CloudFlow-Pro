package com.cloudflow.auth.oauth2;

import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OAuthJson {
    private final ObjectMapper mapper;

    public List<String> strings(String value) {
        if (value == null) return List.of();
        try {
            JsonNode root = mapper.readTree(value);
            if (root == null || !root.isArray() || root.size() > 100) throw new IllegalArgumentException();
            List<String> result = new ArrayList<>();
            for (JsonNode item : root) {
                if (!item.isTextual() || item.asText().isBlank() || item.asText().length() > 1000) throw new IllegalArgumentException();
                result.add(item.asText());
            }
            if (result.stream().distinct().count() != result.size()) throw new IllegalArgumentException();
            return List.copyOf(result);
        } catch (JsonProcessingException | IllegalArgumentException invalid) {
            throw new OAuthFailure("server_error", "第三方授权配置无效，请联系管理员", 503);
        }
    }

    public String write(List<String> values) {
        try { return mapper.writeValueAsString(values); }
        catch (JsonProcessingException failure) { throw new OAuthFailure("server_error", "授权配置保存失败", 503); }
    }
}

