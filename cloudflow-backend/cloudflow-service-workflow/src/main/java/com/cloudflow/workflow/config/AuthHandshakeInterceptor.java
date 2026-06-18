package com.cloudflow.workflow.config;

import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.cloudflow.common.security.core.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * WebSocket 握手拦截器
 *
 * P3-6 改造：不再从 URL query 取 token（避免 token 进 access log / 浏览器历史）。
 * 刷新后优先从 HttpOnly Cookie 完成握手鉴权；没有 Cookie 时继续兼容首帧 AUTH 消息。
 */
@Component
public class AuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuthHandshakeInterceptor.class);

    @Autowired
    private TokenService tokenService;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            attributes.put("needFirstFrameAuth", Boolean.TRUE);
            attributes.put("handshakeTime", System.currentTimeMillis());
            return true;
        }

        String forgedUserId = servletRequest.getServletRequest().getParameter("userId");
        if (StringUtils.hasText(forgedUserId)) {
            log.warn("WebSocket 握手失败: 禁止携带 userId 参数");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        String token = AuthCookieSupport.resolveRawToken(servletRequest.getServletRequest());
        if (StringUtils.hasText(token)) {
            Map<String, Object> loginUser = tokenService.verifyToken(token);
            Long userId = loginUser != null ? toLong(loginUser.get("userId")) : null;
            if (userId == null) {
                log.warn("WebSocket 握手 Cookie 鉴权失败: token 无效或缺少 userId");
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            attributes.put("userId", userId);
            attributes.put("handshakeAuthenticated", Boolean.TRUE);
            attributes.put("handshakeTime", System.currentTimeMillis());
            return true;
        }

        attributes.put("needFirstFrameAuth", Boolean.TRUE);
        attributes.put("handshakeTime", System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.error("WebSocket 握手后异常: {}", exception.getMessage());
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
        } catch (NumberFormatException ignored) {
            return null;
        }
    }
}
