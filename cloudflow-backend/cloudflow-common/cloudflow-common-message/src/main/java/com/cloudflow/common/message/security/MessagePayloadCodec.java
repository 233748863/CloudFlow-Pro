package com.cloudflow.common.message.security;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Objects;
import java.util.TreeMap;

public final class MessagePayloadCodec {
    private static final String PREFIX = "MESSAGE_ENCRYPTED_V1:";

    private MessagePayloadCodec() { }

    public static void encode(BusinessEventEnvelope envelope, MessageSendRequest request,
            ObjectMapper mapper, MessageSecretCipher cipher) {
        try {
            JsonNode requestTree = internalTree(request, mapper);
            String plain = mapper.writeValueAsString(requestTree);
            envelope.setPayloadDigest(digest(requestTree, mapper));
            if (request.safeChannelTypes().stream().allMatch(type -> type == MessageChannelType.INTERNAL)) {
                envelope.setPayload(plain);
                return;
            }
            ObjectNode protectedValue = mapper.createObjectNode();
            protectedValue.put("tenantId", envelope.getTenantId());
            protectedValue.put("eventId", envelope.getEventId());
            protectedValue.put("sourceModule", envelope.getSourceModule());
            protectedValue.set("request", mapper.readTree(plain));
            envelope.setPayload(PREFIX + cipher.encrypt(mapper.writeValueAsString(protectedValue)));
        } catch (Exception failure) {
            throw new IllegalArgumentException("消息载荷保护失败，请检查消息加密配置");
        }
    }

    public static MessageSendRequest decode(BusinessEventEnvelope envelope, ObjectMapper mapper,
            MessageSecretCipher cipher) {
        try {
            String value = envelope.getPayload();
            JsonNode request;
            if (value.startsWith(PREFIX)) {
                JsonNode protectedValue = mapper.readTree(cipher.decrypt(value.substring(PREFIX.length())));
                if (!Objects.equals(envelope.getTenantId(), protectedValue.path("tenantId").longValue())
                        || !Objects.equals(envelope.getEventId(), protectedValue.path("eventId").textValue())
                        || !Objects.equals(envelope.getSourceModule(), protectedValue.path("sourceModule").textValue())) {
                    throw new IllegalArgumentException("消息载荷归属不一致");
                }
                request = protectedValue.required("request");
            } else {
                request = mapper.readTree(value);
            }
            if (envelope.getPayloadDigest() != null
                    && !Objects.equals(envelope.getPayloadDigest(), digest(request, mapper))) {
                throw new IllegalArgumentException("消息载荷摘要不一致");
            }
            return mapper.treeToValue(request, MessageSendRequest.class);
        } catch (Exception failure) {
            throw new IllegalArgumentException("消息载荷无效或无法解密");
        }
    }

    public static String digest(JsonNode value, ObjectMapper mapper) {
        try {
            return hash(mapper.writeValueAsString(canonical(value, mapper)));
        } catch (Exception failure) {
            throw new IllegalArgumentException("消息内容摘要计算失败");
        }
    }

    public static JsonNode internalTree(Object value, ObjectMapper mapper) {
        try {
            return mapper.readTree(mapper.writer().withAttribute("cloudflow.message.internal-payload", true).writeValueAsString(value));
        } catch (Exception failure) {
            throw new IllegalArgumentException("内部消息载荷序列化失败");
        }
    }

    public static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception failure) {
            throw new IllegalStateException("消息身份摘要计算失败");
        }
    }

    private static JsonNode canonical(JsonNode value, ObjectMapper mapper) {
        if (value.isObject()) {
            TreeMap<String, JsonNode> sorted = new TreeMap<>();
            value.fields().forEachRemaining(entry -> sorted.put(entry.getKey(), canonical(entry.getValue(), mapper)));
            ObjectNode result = mapper.createObjectNode();
            sorted.forEach(result::set);
            return result;
        }
        if (value.isArray()) {
            ArrayNode result = mapper.createArrayNode();
            value.forEach(item -> result.add(canonical(item, mapper)));
            return result;
        }
        return value;
    }
}
