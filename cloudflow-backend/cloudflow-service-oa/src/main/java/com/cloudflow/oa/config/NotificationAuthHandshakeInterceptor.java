package com.cloudflow.oa.config;

import com.cloudflow.common.security.core.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
public class NotificationAuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(NotificationAuthHandshakeInterceptor.class);

    private final TokenService tokenService;

    public NotificationAuthHandshakeInterceptor(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            response.setStatusCode(HttpStatus.BAD_REQUEST);
            return false;
        }

        String forgedUserId = servletRequest.getServletRequest().getParameter("userId");
        if (StringUtils.hasText(forgedUserId)) {
            log.warn("OA WebSocket 握手失败: 禁止携带 userId 参数");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        String token = servletRequest.getServletRequest().getParameter("token");
        if (!StringUtils.hasText(token)) {
            log.warn("OA WebSocket 握手失败: 缺少 token 参数");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        Map<String, Object> loginUser = tokenService.verifyToken(token);
        if (loginUser == null) {
            log.warn("OA WebSocket 握手失败: token 无效或已过期");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        Long userId = toLong(loginUser.get("userId"));
        if (userId == null) {
            log.warn("OA WebSocket 握手失败: token 中缺少有效 userId");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        attributes.put("userId", userId);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.warn("OA WebSocket 握手后异常: {}", exception.getMessage());
        }
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
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
