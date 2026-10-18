package com.cloudflow.oa.message;

import com.cloudflow.common.message.push.MessagePushGateway;
import com.cloudflow.oa.config.NotificationWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * OA WebSocket 站内推送适配器。
 */
@Component
@RequiredArgsConstructor
public class OaMessagePushGateway implements MessagePushGateway {
    private final NotificationWebSocketHandler handler;

    @Override
    public void push(Long userId, Map<String, Object> message) {
        handler.sendMessage(userId, message);
    }
}
