package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalAccessPolicy;
import com.cloudflow.common.security.portal.PortalClientAddress;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalPaths;
import com.cloudflow.common.security.portal.PortalTokens;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.headers.HttpHeadersFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@Component
@RequiredArgsConstructor
public class PortalGatewayAccess implements HttpHeadersFilter, Ordered {
    private static final String VERIFIED_CLIENT = PortalGatewayAccess.class.getName() + ".clientIp";
    private final PortalAccessPolicy access;
    private final PortalTokens tokens;
    private final TenantStatusChecker tenants;
    private final ObjectMapper json;

    @Override
    public int getOrder() { return Ordered.LOWEST_PRECEDENCE; }

    @Override
    public HttpHeaders filter(HttpHeaders input, ServerWebExchange exchange) {
        String clientIp = exchange.getAttribute(VERIFIED_CLIENT);
        if (clientIp == null) return input;
        HttpHeaders headers = new HttpHeaders();
        headers.addAll(input);
        headers.set("X-Forwarded-Proto", "https");
        headers.set("X-Forwarded-For", clientIp);
        for (String header : List.of("Forwarded", "X-Forwarded-Host", "X-Forwarded-Port", "X-Forwarded-Prefix")) headers.remove(header);
        return headers;
    }

    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();
        String method = request.getMethod().name();
        if (!PortalPaths.supported(method, path)) return fail(exchange, 404, "客户门户接口不存在");
        String remote = request.getRemoteAddress() == null || request.getRemoteAddress().getAddress() == null
                ? "unknown" : request.getRemoteAddress().getAddress().getHostAddress();
        try {
            access.checkTransport("https".equalsIgnoreCase(request.getURI().getScheme()), remote,
                    request.getHeaders().getFirst("X-Forwarded-Proto"), request.getHeaders().getOrigin());
        } catch (ServiceException unavailable) {
            return fail(exchange, unavailable.getCode(), unavailable.getMessage());
        }
        if (PortalPaths.publicEndpoint(method, path)) return forward(exchange, chain, null, remote);
        List<String> supplied = request.getHeaders().get(PortalTokens.HEADER);
        if (supplied == null || supplied.size() != 1) return fail(exchange, 401, "门户登录状态已失效，请重新登录");
        return Mono.fromCallable(() -> Optional.ofNullable(tokens.verify(supplied.get(0))))
                .subscribeOn(Schedulers.boundedElastic()).flatMap(verified -> verified
                        .map(identity -> tenants.isAvailable(identity.tenantId()).flatMap(available -> Boolean.TRUE.equals(available)
                                ? forward(exchange, chain, identity, remote) : fail(exchange, 401, "门户登录状态已失效，请重新登录")))
                        .orElseGet(() -> fail(exchange, 401, "门户登录状态已失效，请重新登录")))
                .onErrorResume(failure -> fail(exchange, 503, "客户门户验证暂不可用，请稍后重试"));
    }

    private Mono<Void> forward(ServerWebExchange exchange, GatewayFilterChain chain, PortalIdentity identity, String remote) {
        if (identity != null) exchange.getAttributes().put(TraceGlobalFilter.IDENTITY,
                new TraceGlobalFilter.Identity(identity.tenantId(), "portal:" + identity.portalUserId()));
        String clientIp = PortalClientAddress.resolve(remote, exchange.getRequest().getHeaders().getFirst("X-Forwarded-For"));
        exchange.getAttributes().put(VERIFIED_CLIENT, clientIp);
        ServerHttpRequest request = exchange.getRequest().mutate().headers(headers -> {
            for (String header : List.of("Authorization", "Cookie", "X-Auth-Token", "X-User-Id", "X-User-Name",
                    "X-User-Roles", "X-User-Dept-Name", "X-User-Tenant-Id", SecurityConstants.TENANT_ID_HEADER,
                    SecurityConstants.INNER_CALL_HEADER, SecurityConstants.FROM_SERVICE_HEADER,
                    "Forwarded", "X-Forwarded-Host", "X-Forwarded-Ssl", "X-Real-IP", "Proxy-Client-IP",
                    "WL-Proxy-Client-IP", "HTTP_CLIENT_IP", "HTTP_X_FORWARDED_FOR")) headers.remove(header);
            headers.set("X-Forwarded-For", clientIp);
            headers.set("X-Forwarded-Proto", "https");
            if (identity != null) headers.set(SecurityConstants.TENANT_ID_HEADER, identity.tenantId().toString());
        }).build();
        exchange.getResponse().getHeaders().setCacheControl("no-store");
        exchange.getResponse().getHeaders().set("Referrer-Policy", "no-referrer");
        return chain.filter(exchange.mutate().request(request).build());
    }

    private Mono<Void> fail(ServerWebExchange exchange, int code, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatusCode.valueOf(code));
        response.getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        response.getHeaders().setCacheControl("no-store");
        response.getHeaders().set("Referrer-Policy", "no-referrer");
        if (code == 429) response.getHeaders().set("Retry-After", "60");
        try {
            byte[] body = json.writeValueAsBytes(Map.of("code", code, "msg", message));
            return response.writeWith(Mono.just(response.bufferFactory().wrap(body)));
        } catch (JsonProcessingException impossible) {
            return response.setComplete();
        }
    }
}
