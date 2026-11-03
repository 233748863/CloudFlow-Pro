package com.cloudflow.auth.message;

import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.ChannelTestContext;
import com.cloudflow.common.message.channel.ChannelTestResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.push.MessagePushGateway;
import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 站内渠道实现：记录由消息消费服务统一写入，本类负责实时推送。
 */
@Component
@RequiredArgsConstructor
public class InternalChannelSender implements MessageChannelSender {
    private final MessagePushGateway pushGateway;

    @Override
    public MessageChannelType channelType() {
        return MessageChannelType.INTERNAL;
    }

    @Override
    public boolean implemented() {
        return true;
    }

    @Override
    public ChannelSendResult send(ChannelSendContext context) {
        MessageReceiver receiver = context.getReceiver();
        if (receiver == null || receiver.getReceiverId() == null) {
            return ChannelSendResult.failed("站内消息缺少接收人");
        }
        SystemNoticeCreatedEvent event = notice(context.getRecordId(), context.getTenantId(), receiver.getReceiverId(),
                context.getTitle(), context.getContent(), context.getMessageCategory());
        if (context.getParams() != null) {
            Object senderId = context.getParams().get("senderId");
            Object senderName = context.getParams().get("senderName");
            event.setSenderId(senderId == null ? null : Long.valueOf(senderId.toString()));
            event.setSenderName(senderName == null ? null : senderName.toString());
        }
        event.setLinkUrl(context.getLinkUrl());
        pushGateway.push(event);
        return ChannelSendResult.success();
    }

    @Override
    public ChannelTestResult test(ChannelTestContext context) {
        if (context == null || context.getTarget() == null || context.getTarget().isBlank()) {
            return ChannelTestResult.builder().success(false).message("请填写测试接收用户ID").build();
        }
        try {
            Long userId = Long.valueOf(context.getTarget().trim());
            pushGateway.push(notice(0L, context.getTenantId(), userId, "消息渠道测试",
                    context.getContent() == null ? "站内消息渠道可用" : context.getContent(), "SYSTEM"));
            return ChannelTestResult.builder().success(true).message("测试消息已发送").build();
        } catch (NumberFormatException e) {
            return ChannelTestResult.builder().success(false).message("测试接收用户ID格式不正确").build();
        }
    }

    private SystemNoticeCreatedEvent notice(Long recordId, Long tenantId, Long recipientId,
            String title, String content, String type) {
        SystemNoticeCreatedEvent event = new SystemNoticeCreatedEvent();
        event.setNoticeId(recordId);
        event.setTenantId(tenantId);
        event.setRecipientId(recipientId);
        event.setTitle(title == null || title.isBlank() ? "新消息" : title);
        event.setContent(content == null ? "" : content);
        event.setType(type);
        event.setStatus("SUCCESS");
        event.setCreateTime(LocalDateTime.now());
        return event;
    }
}
