package com.cloudflow.common.message.channel;

import com.cloudflow.common.message.constant.MessageChannelType;

/**
 * 消息渠道策略接口。
 */
public interface MessageChannelSender {
    MessageChannelType channelType();

    boolean implemented();

    ChannelSendResult send(ChannelSendContext context);

    default ChannelTestResult test(ChannelTestContext context) {
        return ChannelTestResult.notImplemented();
    }
}
