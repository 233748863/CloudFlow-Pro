package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.utils.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
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
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class AuthFilter implements GlobalFilter, Ordered {

    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    
    @Autowired
    private TokenService tokenService;
    
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
        
        // 处理角色信息
        String rolesStr = "";
        Object rolesObj = loginUser.get("roles");
        if (rolesObj instanceof Collection) {
            rolesStr = String.join(",", (Collection<String>) rolesObj);
        }
        
        // 将用户信息传递给下游
        ServerHttpRequest mutableReq = request.mutate()
                .header("X-User-Name", (String) loginUser.get("username"))
                .header("X-User-Id", String.valueOf(loginUser.get("userId")))
                .header("X-User-Roles", rolesStr)
                .header("X-User-Dept-Id", String.valueOf(loginUser.get("deptId")))
                .header("X-User-Dept-Name", encodeDeptName(loginUser.get("deptName")))
                // 如果 Token 中有租户ID，优先使用；否则检查请求头中的 X-Tenant-Id
                .header("X-User-Tenant-Id", loginUser.containsKey("tenantId") 
                        ? String.valueOf(loginUser.get("tenantId")) 
                        : (request.getHeaders().getFirst("X-Tenant-Id") != null ? request.getHeaders().getFirst("X-Tenant-Id") : "100000"))
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

    /**
     * 对部门名称进行 URL 编码，确保中文字符能安全传递到 HTTP header
     * 下游服务的 UserContextInterceptor 会进行解码
     */
    private String encodeDeptName(Object deptName) {
        if (deptName == null) {
            return "";
        }
        try {
            return java.net.URLEncoder.encode(String.valueOf(deptName), "UTF-8");
        } catch (Exception e) {
            return String.valueOf(deptName);
        }
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
