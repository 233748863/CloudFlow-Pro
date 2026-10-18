package com.cloudflow.common.message.channel;

import com.cloudflow.common.message.constant.MessageChannelType;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 渠道策略工厂。
 */
@Component
public class MessageChannelSenderFactory {
    private final Map<MessageChannelType, MessageChannelSender> senders = new EnumMap<>(MessageChannelType.class);

    public MessageChannelSenderFactory(List<MessageChannelSender> senderList) {
        if (senderList != null) {
            senderList.forEach(sender -> senders.put(sender.channelType(), sender));
        }
    }

    public MessageChannelSender get(MessageChannelType channelType) {
        return senders.get(channelType);
    }
}
