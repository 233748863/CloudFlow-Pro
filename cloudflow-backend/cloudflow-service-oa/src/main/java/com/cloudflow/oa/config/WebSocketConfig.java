package com.cloudflow.oa.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 配置类
 * 注册 WebSocket 端点，允许前端通过 ws://host:port/ws/notification 连接
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final NotificationWebSocketHandler notificationWebSocketHandler;
    private final NotificationAuthHandshakeInterceptor notificationAuthHandshakeInterceptor;

    public WebSocketConfig(NotificationWebSocketHandler notificationWebSocketHandler,
                           NotificationAuthHandshakeInterceptor notificationAuthHandshakeInterceptor) {
        this.notificationWebSocketHandler = notificationWebSocketHandler;
        this.notificationAuthHandshakeInterceptor = notificationAuthHandshakeInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // 注册通知推送端点，允许跨域
        registry.addHandler(notificationWebSocketHandler, "/ws/notification")
                .addInterceptors(notificationAuthHandshakeInterceptor)
                .setAllowedOrigins("*");
    }
}
