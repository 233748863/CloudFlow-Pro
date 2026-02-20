package com.cloudflow.common.sse.core;

import cn.hutool.core.collection.CollUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * SSE Emitter 管理器
 * 管理所有用户的 SSE 连接，支持向指定用户或所有用户推送消息
 *
 * 核心功能：
 * 1. 用户连接管理（建立/断开）
 * 2. 单用户消息推送
 * 3. 多用户消息推送
 * 4. 全局广播
 *
 * @author CloudFlow
 */
@Slf4j
public class SseEmitterManager {

    /**
     * SSE 连接超时时间（毫秒），0 表示永不超时
     */
    private static final long SSE_TIMEOUT = 0L;

    /**
     * 用户 SSE 连接池
     * key: 用户 ID
     * value: SseEmitter 实例
     */
    private final Map<Long, SseEmitter> userEmitters = new ConcurrentHashMap<>();

    /**
     * 创建用户的 SSE 连接
     *
     * @param userId 用户 ID
     * @return SseEmitter 实例
     */
    public SseEmitter connect(Long userId) {
        // 如果已有连接，先关闭旧连接
        disconnect(userId);

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);

        // 注册连接完成/超时/错误的回调
        emitter.onCompletion(() -> {
            log.debug("SSE 连接完成，用户: {}", userId);
            userEmitters.remove(userId);
        });
        emitter.onTimeout(() -> {
            log.debug("SSE 连接超时，用户: {}", userId);
            userEmitters.remove(userId);
        });
        emitter.onError(e -> {
            log.debug("SSE 连接错误，用户: {}，原因: {}", userId, e.getMessage());
            userEmitters.remove(userId);
        });

        userEmitters.put(userId, emitter);
        log.info("SSE 连接建立，用户: {}，当前在线: {}", userId, userEmitters.size());

        // 发送初始连接成功事件
        try {
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data("SSE 连接成功"));
        } catch (IOException e) {
            log.warn("发送 SSE 连接确认失败，用户: {}", userId);
        }

        return emitter;
    }

    /**
     * 断开用户的 SSE 连接
     *
     * @param userId 用户 ID
     */
    public void disconnect(Long userId) {
        SseEmitter emitter = userEmitters.remove(userId);
        if (emitter != null) {
            try {
                emitter.complete();
            } catch (Exception e) {
                // 忽略关闭异常
            }
            log.info("SSE 连接断开，用户: {}，当前在线: {}", userId, userEmitters.size());
        }
    }

    /**
     * 向指定用户发送消息
     *
     * @param userId  用户 ID
     * @param message 消息内容
     */
    public void sendMessage(Long userId, String message) {
        SseEmitter emitter = userEmitters.get(userId);
        if (emitter != null) {
            try {
                emitter.send(SseEmitter.event()
                        .name("message")
                        .data(message));
            } catch (IOException e) {
                log.warn("SSE 消息发送失败，用户: {}，移除连接", userId);
                userEmitters.remove(userId);
            }
        }
    }

    /**
     * 向多个用户发送消息
     *
     * @param userIds 用户 ID 列表
     * @param message 消息内容
     */
    public void sendMessage(List<Long> userIds, String message) {
        if (CollUtil.isEmpty(userIds)) {
            // 空列表表示广播给所有用户
            broadcast(message);
            return;
        }
        for (Long userId : userIds) {
            sendMessage(userId, message);
        }
    }

    /**
     * 广播消息给所有在线用户
     *
     * @param message 消息内容
     */
    public void broadcast(String message) {
        userEmitters.forEach((userId, emitter) -> {
            try {
                emitter.send(SseEmitter.event()
                        .name("message")
                        .data(message));
            } catch (IOException e) {
                log.warn("SSE 广播消息发送失败，用户: {}，移除连接", userId);
                userEmitters.remove(userId);
            }
        });
    }

    /**
     * 检查用户是否在线（有 SSE 连接）
     *
     * @param userId 用户 ID
     * @return 是否在线
     */
    public boolean isOnline(Long userId) {
        return userEmitters.containsKey(userId);
    }

    /**
     * 获取当前在线用户数
     */
    public int getOnlineCount() {
        return userEmitters.size();
    }

    /**
     * 获取所有在线用户 ID
     */
    public java.util.Set<Long> getOnlineUserIds() {
        return userEmitters.keySet();
    }
}
