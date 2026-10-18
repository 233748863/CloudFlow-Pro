package com.cloudflow.auth.message;

public interface MessageDeliverySourceGuard {
    boolean supports(String sourceModule, String businessType);

    String rejectionCode(MessageDeliveryPayload payload);

    default boolean verifyAtSendBoundary() { return false; }

    default java.util.List<com.cloudflow.common.message.api.MessageAttachment> attachments(MessageDeliveryPayload payload) {
        return java.util.List.of();
    }
}
