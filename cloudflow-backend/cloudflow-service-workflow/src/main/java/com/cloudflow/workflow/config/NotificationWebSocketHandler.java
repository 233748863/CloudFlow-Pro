package com.cloudflow.workflow.config;

import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * WebSocket 通知通道
 *
 * P3-6 协议：握手阶段不再校验 token；连接建立后客户端必须在配置的认证超时时间内发送
 * 首帧 {"type":"AUTH","token":"xxx"}，服务端校验通过回 {"type":"AUTH_OK"} 并进入业务消息处理；
 * 校验失败回 {"type":"AUTH_FAIL"} 并立即关闭；超时未鉴权则服务端主动关闭（reason=AUTH_TIMEOUT）。
 */
@Component
public class NotificationWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(NotificationWebSocketHandler.class);

    /** 兜底默认值：WS 首次认证超时毫秒（实际值从 sys.workflow.notification.authTimeoutMs 读取） */
    private static final long DEFAULT_AUTH_TIMEOUT_MS = 5000L;
    private static final String MSG_AUTH_OK = "{\"type\":\"AUTH_OK\"}";
    private static final String MSG_AUTH_FAIL = "{\"type\":\"AUTH_FAIL\"}";

    private static final Map<Long, WebSocketSession> userSessions = new ConcurrentHashMap<>();
    private final Map<String, Boolean> authenticated = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ScheduledExecutorService authTimer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "ws-auth-timeout");
        t.setDaemon(true);
        return t;
    });

    @Autowired
    private TokenService tokenService;

    @Autowired
    private SysConfigHelper sysConfigHelper;

    private long authTimeoutMs() {
        return sysConfigHelper.getConfigLong("sys.workflow.notification.authTimeoutMs", DEFAULT_AUTH_TIMEOUT_MS);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String sid = session.getId();
        Long handshakeUserId = toLong(session.getAttributes().get("userId"));
        if (handshakeUserId != null && Boolean.TRUE.equals(session.getAttributes().get("handshakeAuthenticated"))) {
            registerAuthenticatedSession(session, handshakeUserId);
            sendQuietly(session, MSG_AUTH_OK);
            return;
        }

        authenticated.put(sid, Boolean.FALSE);
        authTimer.schedule(() -> {
            if (Boolean.FALSE.equals(authenticated.get(sid))) {
                closeQuietly(session, CloseStatus.POLICY_VIOLATION.withReason("AUTH_TIMEOUT"));
            }
        }, authTimeoutMs(), TimeUnit.MILLISECONDS);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String sid = session.getId();
        JsonNode root;
        try {
            root = objectMapper.readTree(message.getPayload());
        } catch (IOException e) {
            log.debug("[WS] 消息解析失败 sid={} err={}", sid, e.getMessage());
            closeQuietly(session, CloseStatus.BAD_DATA.withReason("INVALID_JSON"));
            return;
        }
        String type = root.path("type").asText();

        if (!Boolean.TRUE.equals(authenticated.get(sid))) {
            if (!"AUTH".equals(type)) {
                closeQuietly(session, CloseStatus.POLICY_VIOLATION.withReason("NOT_AUTHENTICATED"));
                return;
            }
            String token = root.path("token").asText("");
            if (token.isBlank()) {
                sendQuietly(session, MSG_AUTH_FAIL);
                closeQuietly(session, CloseStatus.NOT_ACCEPTABLE);
                return;
            }
            Map<String, Object> userMap;
            try {
                userMap = tokenService.verifyToken(token);
            } catch (Exception e) {
                log.warn("[WS] token 校验异常 sid={} err={}", sid, e.getMessage());
                userMap = null;
            }
            if (userMap == null) {
                sendQuietly(session, MSG_AUTH_FAIL);
                closeQuietly(session, CloseStatus.NOT_ACCEPTABLE);
                return;
            }
            Long userId = extractUserId(userMap);
            if (userId == null) {
                sendQuietly(session, MSG_AUTH_FAIL);
                closeQuietly(session, CloseStatus.NOT_ACCEPTABLE);
                return;
            }
            registerAuthenticatedSession(session, userId);
            sendQuietly(session, MSG_AUTH_OK);
            return;
        }

        // 已鉴权连接的业务消息（当前仅做日志占位，后续按需扩展）
        log.debug("[WS] 收到业务消息 sid={} type={}", sid, type);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        authenticated.remove(session.getId());
        Long userId = (Long) session.getAttributes().get("userId");
        if (userId != null) {
            userSessions.remove(userId);
        }
    }

    public void sendMessage(Long userId, Object message) {
        WebSocketSession session = userSessions.get(userId);
        if (session != null && session.isOpen()) {
            try {
                String json = objectMapper.writeValueAsString(message);
                session.sendMessage(new TextMessage(json));
            } catch (IOException e) {
                log.warn("[WS] 发送消息失败: userId={}, error={}", userId, e.getMessage());
            }
        }
    }

    /**
     * 按 topic 推送消息，前端通过 subscribeWsTopic(topic) 订阅。
     */
    public void sendTopicMessage(Long userId, String topic, Object payload) {
        if (userId == null) {
            return;
        }
        Map<String, Object> envelope = new HashMap<>();
        envelope.put("topic", topic);
        envelope.put("payload", payload);
        sendMessage(userId, envelope);
    }

    private Long extractUserId(Map<String, Object> userMap) {
        return toLong(userMap.get("userId"));
    }

    private void registerAuthenticatedSession(WebSocketSession session, Long userId) {
        session.getAttributes().put("userId", userId);
        userSessions.put(userId, session);
        authenticated.put(session.getId(), Boolean.TRUE);
    }

    private Long toLong(Object value) {
        if (value instanceof Long longValue) {
            return longValue;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private void sendQuietly(WebSocketSession session, String payload) {
        try {
            if (session.isOpen()) {
                session.sendMessage(new TextMessage(payload));
            }
        } catch (IOException ignored) {
        }
    }

    private void closeQuietly(WebSocketSession session, CloseStatus status) {
        try {
            if (session.isOpen()) {
                session.close(status);
            }
        } catch (IOException ignored) {
        }
    }

    @PreDestroy
    public void shutdown() {
        authTimer.shutdownNow();
    }
}
