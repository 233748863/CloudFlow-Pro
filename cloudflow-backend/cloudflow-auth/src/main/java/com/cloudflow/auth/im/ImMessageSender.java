package com.cloudflow.auth.im;

import com.cloudflow.common.message.channel.ChannelSendResult;

public interface ImMessageSender {
    String providerType();
    ChannelSendResult send(WeComCredentials credentials, Notice notice);

    record Notice(String externalUserId, String title, String content, String linkUrl) {
        @Override public String toString() { return "ImMessageSender.Notice[redacted]"; }
    }
}
