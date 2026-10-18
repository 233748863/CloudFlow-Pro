package com.cloudflow.common.message.api;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;

public record MessageDeliverySnapshot(MessageDeliveryResult result, MessageSendRequest request,
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime acceptedTime) {
    @Override
    public String toString() { return "MessageDeliverySnapshot[recordId=" + (result == null ? null : result.recordId()) + "]"; }
}
