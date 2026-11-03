package com.cloudflow.oa.message;

import com.cloudflow.common.message.push.MessagePushGateway;
import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import com.cloudflow.oa.config.NotificationWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.LinkedHashMap;

/**
 * OA WebSocket 站内推送适配器。
 */
@Component
@RequiredArgsConstructor
public class OaMessagePushGateway implements MessagePushGateway {
    private final NotificationWebSocketHandler handler;

    @Override
    public void push(SystemNoticeCreatedEvent event) {
        Map<String, Object> notice = new LinkedHashMap<>();
        notice.put("noticeId", event.getNoticeId());
        notice.put("noticeTitle", event.getTitle());
        notice.put("noticeContent", event.getContent());
        notice.put("noticeType", event.getType());
        notice.put("status", event.getStatus());
        notice.put("linkUrl", event.getLinkUrl());
        notice.put("senderId", event.getSenderId());
        notice.put("recipientId", event.getRecipientId());
        notice.put("createBy", event.getSenderName());
        notice.put("createTime", event.getCreateTime());
        handler.sendMessage(event.getRecipientId(), Map.of("type", "NOTICE", "data", notice));
    }
}
