package com.cloudflow.common.message.channel;

import lombok.Builder;
import lombok.Data;

/**
 * 渠道发送结果。
 */
@Data
@Builder
public class ChannelSendResult {
    private boolean success;
    private boolean implemented;
    private String skipReason;
    private String errorMessage;
    private String outcome;
    private String providerMessageId;
    @com.fasterxml.jackson.annotation.JsonIgnore
    @lombok.ToString.Exclude
    private java.util.Map<String, String> privateReceipt;

    public static ChannelSendResult success() {
        return builder().success(true).implemented(true).outcome("SENT").build();
    }

    public static ChannelSendResult notImplemented() {
        return builder().success(false).implemented(false).outcome("FAILED").errorMessage("NOT_IMPLEMENTED").build();
    }

    public static ChannelSendResult failed(String message) {
        return builder().success(false).implemented(true).outcome("FAILED").errorMessage(message).build();
    }

    public static ChannelSendResult accepted(String providerMessageId) {
        return builder().success(true).implemented(true).outcome("SENT").providerMessageId(providerMessageId).build();
    }

    public static ChannelSendResult retryable(String reason) {
        return builder().implemented(true).outcome("RETRYABLE").errorMessage(reason).build();
    }

    public static ChannelSendResult unknown(String reason) {
        return builder().implemented(true).outcome("UNKNOWN").errorMessage(reason).build();
    }

    public static ChannelSendResult skipped(String reason) {
        return builder().implemented(true).outcome("SKIPPED").skipReason(reason).build();
    }
}
