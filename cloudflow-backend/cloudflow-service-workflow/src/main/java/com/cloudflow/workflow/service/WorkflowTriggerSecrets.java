package com.cloudflow.workflow.service;

import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Iterator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class WorkflowTriggerSecrets {
    private static final Set<String> PUBLIC_HEADERS = Set.of("content-type", "accept", "accept-language",
            "user-agent", "idempotency-key", "x-workflow-trigger-id");
    private final String key;
    private final ObjectMapper mapper;
    private final SecureRandom random = new SecureRandom();

    public WorkflowTriggerSecrets(@Value("${cloudflow.encrypt.aes-key:${CLOUDFLOW_ENCRYPT_AES_KEY:}}") String key,
                                  ObjectMapper mapper) {
        this.key = key;
        this.mapper = mapper;
    }

    public String seal(String plain) {
        try {
            byte[] nonce = new byte[12];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey(), new GCMParameterSpec(128, nonce));
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array());
        } catch (WorkflowException failure) {
            throw failure;
        } catch (Exception failure) {
            throw WorkflowException.invalidState("触发配置加密失败");
        }
    }

    public String open(String encoded) {
        try {
            byte[] payload = Base64.getDecoder().decode(encoded);
            if (payload.length < 29) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, payload, 0, 12));
            return new String(cipher.doFinal(payload, 12, payload.length - 12), StandardCharsets.UTF_8);
        } catch (WorkflowException failure) {
            throw failure;
        } catch (Exception failure) {
            throw WorkflowException.invalidState("触发配置解密失败，请检查加密密钥");
        }
    }

    private SecretKeySpec secretKey() {
        byte[] bytes = key == null ? new byte[0] : key.getBytes(StandardCharsets.UTF_8);
        if (bytes.length != 16 && bytes.length != 24 && bytes.length != 32) {
            throw WorkflowException.invalidState("触发配置需要CLOUDFLOW_ENCRYPT_AES_KEY，长度必须为16、24或32字节");
        }
        return new SecretKeySpec(bytes, "AES");
    }

    public Map<String, String> headers(Map<String, Object> props, String name) {
        Map<String, String> result = new LinkedHashMap<>();
        if (props == null) return result;
        Object raw = props.get(name);
        if (raw instanceof String text && !text.isBlank()) {
            raw = mapper.convertValue(headerValues(mapper.valueToTree(text)), new TypeReference<Map<String, Object>>() {});
        }
        if (raw instanceof Map<?, ?> values) values.forEach((header, value) -> result.put(String.valueOf(header),
                "apiHeaders".equals(name) && PUBLIC_HEADERS.contains(String.valueOf(header).toLowerCase(Locale.ROOT))
                        ? HtmlUtils.htmlUnescape(String.valueOf(value)) : String.valueOf(value)));
        Object encrypted = props.get(cipherName(name));
        if (encrypted != null) {
            try {
                result.putAll(mapper.readValue(open(String.valueOf(encrypted)), new TypeReference<Map<String, String>>() {}));
            } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
                throw WorkflowException.validationError("触发请求头密文格式不正确");
            }
        }
        return result;
    }

    public String protectModel(String modelJson, String previousJson) {
        if (modelJson == null || modelJson.isBlank()) return modelJson;
        try {
            JsonNode root = mapper.readTree(modelJson);
            Map<String, JsonNode> previous = new HashMap<>();
            if (previousJson != null && !previousJson.isBlank()) {
                mapper.readTree(previousJson).path("nodes").forEach(node -> previous.put(node.path("id").asText(), node));
            }
            for (JsonNode node : root.path("nodes")) {
                if (!"SCRIPT".equals(node.path("type").asText()) || !(node.get("props") instanceof ObjectNode props)) continue;
                for (String name : Set.of("apiHeaders", "actionHeaders")) {
                    ObjectNode values = headerValues(props.get(name));
                    if (values == null) continue;
                    props.set(name, values);
                    JsonNode oldProps = previous.getOrDefault(node.path("id").asText(), node).path("props");
                    Map<String, String> oldHeaders = headers(oldProps.isObject()
                            ? mapper.convertValue(oldProps, new TypeReference<Map<String, Object>>() {}) : Map.of(), name);
                    Map<String, String> confidential = new LinkedHashMap<>();
                    Iterator<Map.Entry<String, JsonNode>> fields = values.fields();
                    while (fields.hasNext()) {
                        Map.Entry<String, JsonNode> field = fields.next();
                        if (PUBLIC_HEADERS.contains(field.getKey().toLowerCase(Locale.ROOT))) continue;
                        String value = field.getValue().asText();
                        if (value.startsWith("****")) {
                            String existing = oldHeaders.get(field.getKey());
                            if (existing == null || (!oldProps.hasNonNull(cipherName(name)) && existing.startsWith("****"))
                                    || !mask(existing).equals(value)) throw WorkflowException.validationError("请求头密钥掩码无对应原值，请重新填写");
                            value = existing;
                        }
                        if (!value.isBlank()) confidential.put(field.getKey(), value);
                        values.put(field.getKey(), mask(value));
                    }
                    props.remove(cipherName(name));
                    if (!confidential.isEmpty()) props.put(cipherName(name), seal(mapper.writeValueAsString(confidential)));
                }
            }
            return mapper.writeValueAsString(root);
        } catch (WorkflowException failure) {
            throw failure;
        } catch (Exception failure) {
            throw WorkflowException.validationError("触发请求头配置无法保存");
        }
    }

    public String maskModel(String modelJson) {
        if (modelJson == null || modelJson.isBlank()) return modelJson;
        try {
            JsonNode root = mapper.readTree(modelJson);
            for (JsonNode node : root.path("nodes")) {
                if (!(node.get("props") instanceof ObjectNode props)) continue;
                for (String name : Set.of("apiHeaders", "actionHeaders")) {
                    ObjectNode normalized = headerValues(props.get(name));
                    if (normalized != null) props.set(name, normalized);
                    Map<String, String> originals = headers(mapper.convertValue(props,
                            new TypeReference<Map<String, Object>>() {}), name);
                    props.remove(cipherName(name));
                    if (props.get(name) instanceof ObjectNode values) {
                        values.fields().forEachRemaining(field -> {
                            String value = originals.getOrDefault(field.getKey(), field.getValue().asText());
                            if (!PUBLIC_HEADERS.contains(field.getKey().toLowerCase(Locale.ROOT)) && !value.startsWith("****")) {
                                values.put(field.getKey(), mask(value));
                            }
                        });
                    }
                }
            }
            return mapper.writeValueAsString(root);
        } catch (Exception failure) {
            throw WorkflowException.invalidState("触发配置无法脱敏");
        }
    }

    private static String cipherName(String name) {
        return "actionHeaders".equals(name) ? "action_headers_cipher" : "api_headers_cipher";
    }

    private ObjectNode headerValues(JsonNode value) {
        if (value == null || value.isNull() || value.isTextual() && value.asText().isBlank()) return null;
        if (value instanceof ObjectNode object) return object;
        if (value.isTextual()) {
            try {
                JsonNode parsed;
                try {
                    parsed = mapper.readTree(value.asText());
                } catch (com.fasterxml.jackson.core.JsonProcessingException encoded) {
                    parsed = mapper.readTree(HtmlUtils.htmlUnescape(value.asText()));
                }
                if (parsed instanceof ObjectNode object) return object;
            } catch (com.fasterxml.jackson.core.JsonProcessingException invalid) {
                throw WorkflowException.validationError("触发请求头必须为JSON对象");
            }
        }
        throw WorkflowException.validationError("触发请求头必须为JSON对象");
    }

    private static String mask(String value) {
        if (value == null || value.isBlank()) return "";
        return "****" + (value.length() > 4 ? value.substring(value.length() - 4) : "");
    }
}
