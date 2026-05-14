package com.cloudflow.gateway.filter;

import com.cloudflow.common.security.core.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 网关认证过滤器
 *
 * 改造说明：
 * - 网关只负责校验 Bearer Token 是否有效
 * - 下游服务统一从 Authorization 头读取原始 Token，并通过 Sa-Token / Redis 还原登录态
 * - 清理旧版 X-Auth-Token、X-User-* 透传头，避免伪造和链路歧义
 *
 * @author CloudFlow
 */
@Component
public class AuthFilter implements GlobalFilter, Ordered {

    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    
    @Autowired
    private TokenService tokenService;

    // 白名单（WebSocket 认证由下游服务的 HandshakeInterceptor 处理，网关放行）
    private final List<String> whiteList = Arrays.asList(
            "/auth/login",
            "/auth/register",
            "/auth/tenant/options",
            "/auth/captcha/**",
            "/ws/**"
    );

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        // 跳过白名单
        for (String url : whiteList) {
            if (pathMatcher.match(url, path)) {
                return chain.filter(exchange);
            }
        }

        String rawToken = resolveRawToken(exchange);
        if (rawToken == null || rawToken.isBlank()) {
            return unauthorized(exchange);
        }

        Map<String, Object> loginUser = tokenService.verifyToken(rawToken);
        if (loginUser == null) {
            return unauthorized(exchange);
        }

        ServerHttpRequest mutableReq = request.mutate()
                .headers(headers -> {
                    headers.set("Authorization", "Bearer " + rawToken);
                    headers.remove("X-Auth-Token");
                    headers.remove("X-User-Id");
                    headers.remove("X-User-Name");
                    headers.remove("X-User-Roles");
                    headers.remove("X-User-Dept-Name");
                    headers.remove("X-User-Tenant-Id");
                })
                .build();

        return chain.filter(exchange.mutate().request(mutableReq).build());
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        String body = "{\"code\":401,\"msg\":\"未授权或Token已过期\"}";
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    private String resolveCookieToken(ServerWebExchange exchange) {
        try {
            if (exchange.getRequest().getCookies().containsKey("Authorization")) {
                return exchange.getRequest().getCookies().getFirst("Authorization") != null
                        ? exchange.getRequest().getCookies().getFirst("Authorization").getValue()
                        : null;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String resolveRawToken(ServerWebExchange exchange) {
        String token = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (token == null || token.isBlank()) {
            token = resolveCookieToken(exchange);
        }
        return unwrapBearerToken(token);
    }

    private String unwrapBearerToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        if (token.startsWith("Bearer ")) {
            return token.substring("Bearer ".length());
        }
        return token;
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
