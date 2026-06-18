package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.gateway.config.GatewayAuthProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpCookie;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * 网关认证过滤器
 *
 * 改造说明：
 * - 网关只负责校验 Bearer Token 是否有效
 * - 下游服务统一从 Authorization 头读取原始 Token，并通过 Sa-Token / Redis 还原登录态
 * - 清理旧版 X-Auth-Token、X-User-* 透传头，避免伪造和链路歧义
 * - P2-2：白名单改为读 GatewayAuthProperties，支持 Nacos 动态刷新
 *
 * @author CloudFlow
 */
@Component
public class AuthFilter implements GlobalFilter, Ordered {

    /** 租户停用/过期时返回的业务码（前端拦截到该码强制登出） */
    public static final int TENANT_DISABLED_CODE = 4030;

    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    @Autowired
    private TokenService tokenService;

    @Autowired
    private GatewayAuthProperties authProperties;

    @Autowired
    private TenantStatusChecker tenantStatusChecker;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        // 跳过白名单（每次取最新生效配置，支持 Nacos @RefreshScope 动态刷新）
        List<String> whiteList = authProperties.effectiveWhitelist();
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

        if (hasAuthCookie(exchange)) {
            refreshAuthCookies(exchange, rawToken);
        }

        String tenantIdStr = resolveTenantId(loginUser);
        Long tenantId = parseTenantId(tenantIdStr);

        return tenantStatusChecker.isAvailable(tenantId)
                .flatMap(ok -> {
                    if (!Boolean.TRUE.equals(ok)) {
                        return tenantDisabled(exchange);
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
                                // 防伪造内部调用：外部请求不允许携带 X-Inner-Call / X-From-Service 头穿透到下游
                                headers.remove(SecurityConstants.INNER_CALL_HEADER);
                                headers.remove(SecurityConstants.FROM_SERVICE_HEADER);
                                if (tenantIdStr != null) {
                                    headers.set(SecurityConstants.TENANT_ID_HEADER, tenantIdStr);
                                } else {
                                    headers.remove(SecurityConstants.TENANT_ID_HEADER);
                                }
                            })
                            .build();
                    return chain.filter(exchange.mutate().request(mutableReq).build());
                });
    }

    private Long parseTenantId(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private Mono<Void> tenantDisabled(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.FORBIDDEN);
        response.getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        String body = "{\"code\":" + TENANT_DISABLED_CODE + ",\"msg\":\"租户已停用或已过期，请联系运营\"}";
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        clearAuthCookies(exchange);
        String body = "{\"code\":401,\"msg\":\"未授权或Token已过期\"}";
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    private String resolveCookieToken(ServerWebExchange exchange) {
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(AuthCookieSupport.AUTH_COOKIE_NAME);
        return cookie != null ? cookie.getValue() : null;
    }

    private String resolveRawToken(ServerWebExchange exchange) {
        String token = exchange.getRequest().getHeaders().getFirst(AuthCookieSupport.AUTH_COOKIE_NAME);
        if (token == null || token.isBlank()) {
            token = resolveCookieToken(exchange);
        }
        return unwrapBearerToken(token);
    }

    private String unwrapBearerToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        return AuthCookieSupport.unwrapBearerToken(token);
    }

    private String resolveTenantId(Map<String, Object> loginUser) {
        if (loginUser == null) {
            return null;
        }
        Object tenantId = loginUser.get("tenantId");
        if (tenantId == null) {
            return null;
        }
        String value = String.valueOf(tenantId).trim();
        return StringUtils.hasText(value) ? value : null;
    }

    @Override
    public int getOrder() {
        return -100;
    }

    private boolean hasAuthCookie(ServerWebExchange exchange) {
        return exchange.getRequest().getCookies().getFirst(AuthCookieSupport.AUTH_COOKIE_NAME) != null;
    }

    private void refreshAuthCookies(ServerWebExchange exchange, String rawToken) {
        if (!StringUtils.hasText(rawToken)) {
            return;
        }
        boolean secure = isSecureRequest(exchange.getRequest());
        long maxAgeSeconds = tokenService.getExpirationSeconds();
        String csrfToken = resolveCsrfCookie(exchange);
        if (!StringUtils.hasText(csrfToken)) {
            csrfToken = AuthCookieSupport.newCsrfToken();
        }
        addResponseCookie(exchange, AuthCookieSupport.AUTH_COOKIE_NAME, rawToken, true, secure, maxAgeSeconds);
        addResponseCookie(exchange, AuthCookieSupport.CSRF_COOKIE_NAME, csrfToken, false, secure, maxAgeSeconds);
    }

    private void clearAuthCookies(ServerWebExchange exchange) {
        boolean secure = isSecureRequest(exchange.getRequest());
        addResponseCookie(exchange, AuthCookieSupport.AUTH_COOKIE_NAME, "", true, secure, 0);
        addResponseCookie(exchange, AuthCookieSupport.CSRF_COOKIE_NAME, "", false, secure, 0);
    }

    private String resolveCsrfCookie(ServerWebExchange exchange) {
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(AuthCookieSupport.CSRF_COOKIE_NAME);
        return cookie != null ? cookie.getValue() : null;
    }

    private void addResponseCookie(ServerWebExchange exchange,
                                   String name,
                                   String value,
                                   boolean httpOnly,
                                   boolean secure,
                                   long maxAgeSeconds) {
        ResponseCookie cookie = ResponseCookie.from(name, value)
                .httpOnly(httpOnly)
                .secure(secure)
                .path("/")
                .sameSite(AuthCookieSupport.SAME_SITE)
                .maxAge(Duration.ofSeconds(Math.max(maxAgeSeconds, 0)))
                .build();
        exchange.getResponse().addCookie(cookie);
    }

    private boolean isSecureRequest(ServerHttpRequest request) {
        if (request == null) {
            return false;
        }
        String scheme = request.getURI().getScheme();
        if ("https".equalsIgnoreCase(scheme) || "wss".equalsIgnoreCase(scheme)) {
            return true;
        }
        String forwardedProto = request.getHeaders().getFirst("X-Forwarded-Proto");
        if (StringUtils.hasText(forwardedProto) && "https".equalsIgnoreCase(forwardedProto)) {
            return true;
        }
        String forwardedSsl = request.getHeaders().getFirst("X-Forwarded-Ssl");
        return StringUtils.hasText(forwardedSsl) && "on".equalsIgnoreCase(forwardedSsl);
    }
}
