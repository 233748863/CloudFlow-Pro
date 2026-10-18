package com.cloudflow.common.message.api;

public record MessageSourceCheck(String eventId, Long recordId, MessageSendRequest request) {
    @Override
    public String toString() { return "MessageSourceCheck[recordId=" + recordId + "]"; }
}
