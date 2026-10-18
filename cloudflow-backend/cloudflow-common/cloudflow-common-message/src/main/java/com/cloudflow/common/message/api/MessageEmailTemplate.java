package com.cloudflow.common.message.api;

public record MessageEmailTemplate(Long templateId, String templateCode, Integer version, String content,
        String parameters, String fromAddress, String fromName, boolean ready, String reason) {
    @Override public String toString() { return "MessageEmailTemplate[templateId=" + templateId + ",ready=" + ready + "]"; }
}
