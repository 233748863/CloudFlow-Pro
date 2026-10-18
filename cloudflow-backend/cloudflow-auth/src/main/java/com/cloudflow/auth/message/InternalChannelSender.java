package com.cloudflow.auth.message;

import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.ChannelTestContext;
import com.cloudflow.common.message.channel.ChannelTestResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.push.MessagePushGateway;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

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
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("recordId", context.getRecordId());
        data.put("noticeId", context.getRecordId());
        data.put("tenantId", context.getTenantId());
        data.put("title", context.getTitle());
        data.put("content", context.getContent());
        data.put("noticeTitle", context.getTitle());
        data.put("noticeContent", context.getContent());
        data.put("messageCategory", context.getMessageCategory());
        data.put("noticeType", context.getMessageCategory());
        if (context.getParams() != null) {
            data.put("senderId", context.getParams().get("senderId"));
            data.put("senderName", context.getParams().get("senderName"));
        }
        data.put("linkUrl", context.getLinkUrl());
        data.put("receiverId", receiver.getReceiverId());
        Map<String, Object> message = new LinkedHashMap<>();
        // 兼容现有 workflow WebSocket 客户端的 NOTICE 事件格式。
        message.put("type", "NOTICE");
        message.put("data", data);
        pushGateway.push(receiver.getReceiverId(), message);
        return ChannelSendResult.success();
    }

    @Override
    public ChannelTestResult test(ChannelTestContext context) {
        if (context == null || context.getTarget() == null || context.getTarget().isBlank()) {
            return ChannelTestResult.builder().success(false).message("请填写测试接收用户ID").build();
        }
        try {
            Long userId = Long.valueOf(context.getTarget().trim());
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("recordId", 0L);
            data.put("title", "消息渠道测试");
            data.put("noticeTitle", "消息渠道测试");
            data.put("content", context.getContent() == null ? "站内消息渠道可用" : context.getContent());
            data.put("noticeContent", data.get("content"));
            data.put("messageCategory", "SYSTEM");
            data.put("noticeType", "SYSTEM");
            Map<String, Object> message = new LinkedHashMap<>();
            message.put("type", "NOTICE");
            message.put("data", data);
            pushGateway.push(userId, message);
            return ChannelTestResult.builder().success(true).message("测试消息已发送").build();
        } catch (NumberFormatException e) {
            return ChannelTestResult.builder().success(false).message("测试接收用户ID格式不正确").build();
        }
    }
}
