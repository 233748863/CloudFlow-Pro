package com.cloudflow.oa.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 通知 WebSocket 处理器
 * 用于向指定用户推送实时消息通知
 * 
 * 注意：当前为简化实现，仅记录日志。
 * 后续可集成 Spring WebSocket 或其他消息推送方案（如 SSE、STOMP）。
 */
@Slf4j
@Component
public class NotificationWebSocketHandler {

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 存储用户连接会话（预留，后续 WebSocket 集成时使用）
     */
    private final ConcurrentHashMap<Long, Object> userSessions = new ConcurrentHashMap<>();

    /**
     * 向指定用户发送消息
     *
     * @param userId  目标用户ID
     * @param message 消息内容
     */
    public void sendMessage(Long userId, Map<String, Object> message) {
        if (userId == null) {
            log.warn("发送消息失败：用户ID为空");
            return;
        }

        try {
            String messageJson = objectMapper.writeValueAsString(message);
            
            // 检查用户是否有活跃的连接
            if (userSessions.containsKey(userId)) {
                // TODO: 实际 WebSocket 推送逻辑
                log.debug("向用户 {} 推送消息: {}", userId, messageJson);
            } else {
                // 用户不在线，消息已保存到数据库，用户上线后可查看
                log.debug("用户 {} 不在线，消息已持久化，待用户上线后查看。消息类型: {}", 
                    userId, message.get("type"));
            }
        } catch (Exception e) {
            log.error("向用户 {} 发送消息失败", userId, e);
        }
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
     * 注册用户会话（预留）
     */
    public void registerSession(Long userId, Object session) {
        if (userId != null && session != null) {
            userSessions.put(userId, session);
            log.info("用户 {} 已连接", userId);
        }
    }

    /**
     * 移除用户会话（预留）
     */
    public void removeSession(Long userId) {
        if (userId != null) {
            userSessions.remove(userId);
            log.info("用户 {} 已断开连接", userId);
        }
    }

    /**
     * 获取在线用户数量
     */
    public int getOnlineUserCount() {
        return userSessions.size();
    }
}
