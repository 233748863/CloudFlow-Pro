package com.cloudflow.common.message.push;

import java.util.Map;

/**
 * 站内消息实时推送网关。没有 WebSocket 实现的服务使用空实现，消息仍持久化。
 */
public interface MessagePushGateway {
    void push(Long userId, Map<String, Object> message);
}
