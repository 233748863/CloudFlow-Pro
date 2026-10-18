package com.cloudflow.common.message.api;

public record MessageAttachment(Long fileId, String fileName, String contentType, byte[] content) {
    @Override
    public String toString() { return "MessageAttachment[fileId=" + fileId + ",size=" + (content == null ? 0 : content.length) + "]"; }
}
