package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.im.ImLoginPaths;
import com.cloudflow.common.security.im.ImLoginTransport;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.headers.HttpHeadersFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class ImLoginGatewayAccess implements HttpHeadersFilter, Ordered {
    private static final String CLIENT = ImLoginGatewayAccess.class.getName() + ".client";
    private static final List<String> REMOVE = List.of("Authorization", "Cookie", "portal-token", "oauth2-session", "X-Auth-Token",
            "X-User-Id", "X-User-Name", "X-User-Roles", "X-User-Dept-Name", "X-User-Tenant-Id", SecurityConstants.TENANT_ID_HEADER,
            SecurityConstants.INNER_CALL_HEADER, SecurityConstants.FROM_SERVICE_HEADER, "Forwarded", "X-Forwarded-Host", "X-Forwarded-Port",
            "X-Forwarded-Prefix", "X-Forwarded-Ssl", "X-Real-IP", "Proxy-Client-IP", "WL-Proxy-Client-IP", "HTTP_CLIENT_IP", "HTTP_X_FORWARDED_FOR");

    @Override public int getOrder() { return Ordered.LOWEST_PRECEDENCE; }

    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();
        if (!ImLoginPaths.namespace(path)) return chain.filter(exchange);
        exchange.getResponse().getHeaders().setCacheControl("no-store");
        exchange.getResponse().getHeaders().set("Referrer-Policy", "no-referrer");
        if (!request.getURI().getRawPath().equals(path) || !ImLoginPaths.publicEndpoint(request.getMethod().name(), path)) return rejected(exchange, HttpStatus.NOT_FOUND);
        try {
            String remote = request.getRemoteAddress() == null || request.getRemoteAddress().getAddress() == null ? null : request.getRemoteAddress().getAddress().getHostAddress();
            boolean trusted = IpUtils.isTrustedProxy(remote);
            String proto = trusted ? ImLoginTransport.single(request.getHeaders().get("X-Forwarded-Proto")) : null;
            if (!ImLoginTransport.secure("https".equalsIgnoreCase(request.getURI().getScheme()), remote, proto)) return rejected(exchange, HttpStatus.FORBIDDEN);
            String address = ImLoginTransport.address(remote, trusted ? ImLoginTransport.single(request.getHeaders().get("X-Forwarded-For")) : null);
            exchange.getAttributes().put(CLIENT, address);
            List<String> allowedCookies = ImLoginPaths.callbackEndpoint(request.getMethod().name(), path) ? List.of() : "/im/WECOM/binding-callback".equals(ImLoginPaths.normalized(path))
                    ? List.of("__Host-CloudFlowIM") : List.of("__Host-CloudFlowIM", "__Host-CloudFlowIMMfa");
            List<String> cookies = request.getCookies().entrySet().stream()
                    .filter(entry -> allowedCookies.contains(entry.getKey()))
                    .map(entry -> {
                        if (entry.getValue().size() != 1 || !entry.getValue().get(0).getValue().matches("[A-Za-z0-9_-]{43}")) throw new IllegalArgumentException("Invalid login cookie");
                        return entry.getKey() + "=" + entry.getValue().get(0).getValue();
                    }).toList();
            ServerHttpRequest normalized = request.mutate().headers(headers -> {
                REMOVE.forEach(headers::remove);
                if (!cookies.isEmpty()) headers.set("Cookie", String.join("; ", cookies));
                headers.set("X-Forwarded-For", address);
                headers.set("X-Forwarded-Proto", "https");
            }).build();
            return chain.filter(exchange.mutate().request(normalized).build());
        } catch (IllegalArgumentException failure) { return rejected(exchange, HttpStatus.FORBIDDEN); }
    }

    @Override
    public HttpHeaders filter(HttpHeaders input, ServerWebExchange exchange) {
        String address = exchange.getAttribute(CLIENT);
        if (address == null) return input;
        HttpHeaders headers = new HttpHeaders();
        headers.addAll(input);
        for (String name : List.of("Forwarded", "X-Forwarded-Host", "X-Forwarded-Port", "X-Forwarded-Prefix")) headers.remove(name);
        headers.set("X-Forwarded-For", address);
        headers.set("X-Forwarded-Proto", "https");
        return headers;
    }

    private Mono<Void> rejected(ServerWebExchange exchange, HttpStatus status) {
        exchange.getResponse().setStatusCode(status);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        byte[] body = (status == HttpStatus.NOT_FOUND ? "{\"code\":404,\"msg\":\"企业微信登录接口不存在\"}"
                : "{\"code\":403,\"msg\":\"请通过本系统HTTPS页面使用企业微信登录\"}").getBytes(StandardCharsets.UTF_8);
        return exchange.getResponse().writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(body)));
    }
}
