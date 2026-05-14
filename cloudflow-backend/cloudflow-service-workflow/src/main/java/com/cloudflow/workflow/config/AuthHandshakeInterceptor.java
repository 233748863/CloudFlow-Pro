package com.cloudflow.workflow.config;

import com.cloudflow.common.security.core.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * WebSocket 握手拦截器
 * 在 WebSocket 连接建立前验证 token，提取用户信息
 */
@Component
public class AuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuthHandshakeInterceptor.class);

    @Autowired
    private TokenService tokenService;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        if (request instanceof ServletServerHttpRequest) {
            ServletServerHttpRequest servletRequest = (ServletServerHttpRequest) request;
            String token = servletRequest.getServletRequest().getParameter("token");

            // 检查 token 是否存在
            if (!StringUtils.hasText(token)) {
                log.warn("WebSocket 握手失败: 缺少 token 参数");
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }

            try {
                Map<String, Object> userMap = tokenService.verifyToken(token);
                if (userMap == null) {
                    log.warn("WebSocket 握手失败: token 无效或已过期");
                    response.setStatusCode(HttpStatus.UNAUTHORIZED);
                    return false;
                }

                // 提取 userId，兼容 Integer 和 Long 类型
                Object userIdObj = userMap.get("userId");
                Long userId = null;
                if (userIdObj instanceof Integer) {
                    userId = ((Integer) userIdObj).longValue();
                } else if (userIdObj instanceof Long) {
                    userId = (Long) userIdObj;
                } else if (userIdObj instanceof Number) {
                    userId = ((Number) userIdObj).longValue();
                }

                if (userId == null) {
                    log.warn("WebSocket 握手失败: token 中未包含有效的 userId");
                    response.setStatusCode(HttpStatus.UNAUTHORIZED);
                    return false;
                }

                attributes.put("userId", userId);
                log.debug("WebSocket 握手成功: userId={}", userId);
                return true;
            } catch (Exception e) {
                log.warn("WebSocket 握手失败: token 解析异常 - {}", e.getMessage());
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
        }

        log.warn("WebSocket 握手失败: 非 Servlet 请求");
        response.setStatusCode(HttpStatus.BAD_REQUEST);
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.error("WebSocket 握手后异常: {}", exception.getMessage());
        }
    }
}
