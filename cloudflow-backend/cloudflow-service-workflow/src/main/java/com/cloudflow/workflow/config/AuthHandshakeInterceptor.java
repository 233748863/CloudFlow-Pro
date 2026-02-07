package com.cloudflow.workflow.config;

import com.cloudflow.common.core.utils.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
public class AuthHandshakeInterceptor implements HandshakeInterceptor {

    @Autowired
    private TokenService tokenService;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        if (request instanceof ServletServerHttpRequest) {
            ServletServerHttpRequest servletRequest = (ServletServerHttpRequest) request;
            String token = servletRequest.getServletRequest().getParameter("token");
            
            if (StringUtils.hasText(token)) {
                try {
                    Map<String, Object> userMap = tokenService.verifyToken(token);
                    if (userMap != null) {
                        Object userIdObj = userMap.get("userId");
                        Long userId = null;
                        if (userIdObj instanceof Integer) {
                             userId = ((Integer) userIdObj).longValue();
                        } else if (userIdObj instanceof Long) {
                             userId = (Long) userIdObj;
                        }
                        
                        if (userId != null) {
                            attributes.put("userId", userId);
                            return true;
                        }
                    }
                } catch (Exception e) {
                    // Token invalid
                }
            }
        }
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {

    }
}
