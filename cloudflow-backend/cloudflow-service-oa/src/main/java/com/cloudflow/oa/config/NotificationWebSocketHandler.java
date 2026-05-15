package com.cloudflow.oa.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.common.security.core.TokenService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * 通知 WebSocket 处理器
 * 实现基于原生 WebSocket 的实时消息推送
 * 
 * 前端连接方式：ws://host:port/ws/notification?token=xxx
 * 连接建立后，服务端可通过 sendMessage / broadcastMessage 向指定用户推送消息
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final TokenService tokenService;

    /**
     * 存储用户ID → WebSocket会话集合的映射
     * 同一用户可能有多个设备/标签页连接，因此使用 Set 存储
     */
    private final ConcurrentHashMap<Long, Set<WebSocketSession>> userSessions = new ConcurrentHashMap<>();

    /**
     * 存储 sessionId → userId 的反向映射，用于断开连接时快速查找
     */
    private final ConcurrentHashMap<String, Long> sessionUserMap = new ConcurrentHashMap<>();

    /**
     * 连接建立时调用
     * 从 URL 参数中提取 token 并注册会话
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Long userId = resolveSessionUserId(session);
        if (userId == null) {
            log.warn("WebSocket连接缺少有效用户信息，关闭连接: {}", session.getId());
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        // 注册会话
        userSessions.computeIfAbsent(userId, k -> new CopyOnWriteArraySet<>()).add(session);
        sessionUserMap.put(session.getId(), userId);

        log.info("用户 {} 已建立WebSocket连接，sessionId: {}，当前在线用户数: {}",
                userId, session.getId(), userSessions.size());

        // 发送连接成功确认消息
        Map<String, Object> welcomeMsg = Map.of(
                "type", "CONNECTED",
                "message", "WebSocket连接成功",
                "userId", userId,
                "timestamp", System.currentTimeMillis()
        );
        sendToSession(session, welcomeMsg);
    }

    /**
     * 收到客户端消息时调用（心跳/业务消息）
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        Long userId = sessionUserMap.get(session.getId());

        // 处理心跳消息
        if ("ping".equalsIgnoreCase(payload) || "heartbeat".equalsIgnoreCase(payload)) {
            session.sendMessage(new TextMessage("{\"type\":\"PONG\",\"timestamp\":" + System.currentTimeMillis() + "}"));
            return;
        }

        log.debug("收到用户 {} 的消息: {}", userId, payload);
    }

    /**
     * 连接关闭时调用
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        Long userId = sessionUserMap.remove(session.getId());
        if (userId != null) {
            Set<WebSocketSession> sessions = userSessions.get(userId);
            if (sessions != null) {
                sessions.remove(session);
                // 如果该用户没有任何活跃连接了，移除整个条目
                if (sessions.isEmpty()) {
                    userSessions.remove(userId);
                }
            }
            log.info("用户 {} 断开WebSocket连接，sessionId: {}，状态: {}",
                    userId, session.getId(), status);
        }
    }

    /**
     * 传输错误时调用
     */
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        Long userId = sessionUserMap.get(session.getId());
        log.error("用户 {} WebSocket传输错误，sessionId: {}", userId, session.getId(), exception);
        // 关闭异常连接
        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    // ==================== 对外推送API ====================

    /**
     * 向指定用户发送消息
     *
     * @param userId  目标用户ID
     * @param message 消息内容（Map会被序列化为JSON）
     */
    public void sendMessage(Long userId, Map<String, Object> message) {
        if (userId == null) {
            log.warn("发送消息失败：用户ID为空");
            return;
        }

        Set<WebSocketSession> sessions = userSessions.get(userId);
        if (sessions == null || sessions.isEmpty()) {
            // 用户不在线，消息已持久化到数据库，用户上线后可通过API查看
            log.debug("用户 {} 不在线，消息已持久化，待用户上线后查看。消息类型: {}",
                    userId, message.get("type"));
            return;
        }

        // 向该用户的所有活跃会话推送消息
        int successCount = 0;
        for (WebSocketSession session : sessions) {
            if (sendToSession(session, message)) {
                successCount++;
            }
        }
        log.debug("向用户 {} 推送消息完成，成功 {}/{} 个会话", userId, successCount, sessions.size());
    }

    /**
     * 向多个用户广播消息
     *
     * @param userIds 目标用户ID列表
     * @param message 消息内容
     */
    public void broadcastMessage(Iterable<Long> userIds, Map<String, Object> message) {
        if (userIds == null) {
            return;
        }
        for (Long userId : userIds) {
            sendMessage(userId, message);
        }
    }

    /**
     * 向所有在线用户广播消息
     *
     * @param message 消息内容
     */
    public void broadcastAll(Map<String, Object> message) {
        for (Long userId : userSessions.keySet()) {
            sendMessage(userId, message);
        }
    }

    /**
     * 获取在线用户数量
     */
    public int getOnlineUserCount() {
        return userSessions.size();
    }

    /**
     * 判断指定用户是否在线
     */
    public boolean isUserOnline(Long userId) {
        Set<WebSocketSession> sessions = userSessions.get(userId);
        return sessions != null && !sessions.isEmpty();
    }

    // ==================== 内部方法 ====================

    /**
     * 向单个会话发送消息
     * 
     * @return 是否发送成功
     */
    private boolean sendToSession(WebSocketSession session, Map<String, Object> message) {
        if (session == null || !session.isOpen()) {
            return false;
        }
        try {
            String json = objectMapper.writeValueAsString(message);
            // 同步发送，避免并发写入同一个session
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
            return true;
        } catch (IOException e) {
            log.error("发送WebSocket消息失败，sessionId: {}", session.getId(), e);
            return false;
        }
    }

    private Long resolveSessionUserId(WebSocketSession session) {
        Object value = session.getAttributes().get("userId");
        if (value instanceof Long longValue) {
            return longValue;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return null;
    }
}
