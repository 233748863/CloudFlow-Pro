package com.cloudflow.auth.message;

import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record MessageDeliveryPayload(Long tenantId, String eventId, String sourceModule,
        MessageSendRequest request, ChannelSendContext context, String inputHash, Long templateId,
        Integer templateVersion, List<Attempt> attempts) {
    public record Attempt(Long channelId, LocalDateTime startedAt,
            @com.fasterxml.jackson.databind.annotation.JsonSerialize(using = com.cloudflow.common.message.security.MessageReceiptSerializer.class)
            Map<String, String> privateReceipt) {
        public Attempt(Long channelId, LocalDateTime startedAt) { this(channelId, startedAt, Map.of()); }
        public Attempt { privateReceipt = privateReceipt == null ? Map.of() : Map.copyOf(privateReceipt); }
        @Override public String toString() { return "MessageDeliveryPayload.Attempt[protected]"; }
    }

    public MessageDeliveryPayload receipt(Map<String, String> receipt) {
        if (receipt == null || receipt.isEmpty() || attempts == null || attempts.isEmpty() || receipt.size() > 16
                || receipt.entrySet().stream().anyMatch(entry -> entry.getKey() == null || !entry.getKey().matches("[A-Za-z][A-Za-z0-9_]{0,63}")
                || entry.getValue() == null || entry.getValue().length() > 4096)) throw new IllegalArgumentException("PROVIDER_RECEIPT_INVALID");
        List<Attempt> updated = new java.util.ArrayList<>(attempts);
        Attempt latest = updated.get(updated.size() - 1);
        updated.set(updated.size() - 1, new Attempt(latest.channelId(), latest.startedAt(), receipt));
        return new MessageDeliveryPayload(tenantId, eventId, sourceModule, request, context, inputHash, templateId, templateVersion, List.copyOf(updated));
    }

    @Override
    public String toString() { return "MessageDeliveryPayload[protected]"; }
}
