package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.utils.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
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
 * 改造说明（参考 RuoYi-Cloud-Plus 的 Sa-Token Session 共享思路）：
 * - 网关验证 Token 后，只传递 X-Auth-Token（JWT 中解析出的 UUID）给下游服务
 * - 不再传递 X-User-Id、X-User-Name、X-User-Roles、X-User-Dept-Name 等明文 Header
 * - 下游服务通过 X-Auth-Token 从 Redis 读取完整用户信息，避免 Header 伪造和中文编码问题
 * - 仅保留 X-User-Tenant-Id（纯数字，无编码问题，且租户过滤需要尽早生效）
 * 
 * @author CloudFlow
 */
@Component
public class AuthFilter implements GlobalFilter, Ordered {

    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    
    @Autowired
    private TokenService tokenService;

    /** 默认租户ID，从配置文件读取，未配置时使用 100000 */
    @Value("${cloudflow.tenant.default-tenant-id:100000}")
    private String defaultTenantId;
    
    // 白名单（WebSocket 认证由下游服务的 HandshakeInterceptor 处理，网关放行）
    private final List<String> whiteList = Arrays.asList(
            "/auth/login",
            "/auth/register",
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

        String token = request.getHeaders().getFirst("Authorization");
        if (token == null || !token.startsWith("Bearer ")) {
            return unauthorized(exchange);
        }

        token = token.substring(7);
        
        // 使用 TokenService 校验并自动续期
        Map<String, Object> loginUser = tokenService.verifyToken(token);
        if (loginUser == null) {
            return unauthorized(exchange);
        }
        
        // 从 loginUser 中获取 Token UUID（登录时存入 Redis 的 UUID）
        String authToken = (String) loginUser.get("token");
        
        // 获取租户ID（纯数字，无编码问题）
        String tenantId = loginUser.containsKey("tenantId") 
                ? String.valueOf(loginUser.get("tenantId")) 
                : (request.getHeaders().getFirst("X-Tenant-Id") != null 
                    ? request.getHeaders().getFirst("X-Tenant-Id") : defaultTenantId);

        // 只传递 Token UUID 和租户ID，不再传递明文用户信息
        // 下游服务的 UserContextInterceptor 会通过 X-Auth-Token 从 Redis 读取完整用户信息
        ServerHttpRequest mutableReq = request.mutate()
                .header("X-Auth-Token", authToken)
                .header("X-User-Tenant-Id", tenantId)
                .build();

        return chain.filter(exchange.mutate().request(mutableReq).build());
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        String body = "{\"code\":401,\"msg\":\"未授权或Token已过期\"}";
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
