package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.oauth2.OAuthAccessPolicy;
import com.cloudflow.common.security.oauth2.OAuthDigests;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import com.cloudflow.common.security.oauth2.OAuthPaths;
import com.cloudflow.common.security.oauth2.OAuthTokens;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.headers.HttpHeadersFilter;
import org.springframework.core.Ordered;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@Component
public class OAuthGatewayAccess implements HttpHeadersFilter, Ordered {
    private static final String CLIENT = OAuthGatewayAccess.class.getName() + ".client";
    private static final String PROTO = OAuthGatewayAccess.class.getName() + ".proto";
    private final OAuthAccessPolicy policy;
    private final OAuthTokens tokens;
    private final WebClient client;
    private final ObjectMapper json;

    public OAuthGatewayAccess(OAuthAccessPolicy policy, OAuthTokens tokens,
            @Qualifier("tenantStatusWebClientBuilder") WebClient.Builder builder, ObjectMapper json) {
        this.policy = policy;
        this.tokens = tokens;
        this.client = builder.clone().build();
        this.json = json;
    }

    @Override
    public int getOrder() { return Ordered.LOWEST_PRECEDENCE; }

    @Override
    public HttpHeaders filter(HttpHeaders input, ServerWebExchange exchange) {
        String address = exchange.getAttribute(CLIENT);
        if (address == null) return input;
        HttpHeaders headers = new HttpHeaders();
        headers.addAll(input);
        headers.set("X-Forwarded-For", address);
        headers.set("X-Forwarded-Proto", exchange.getAttribute(PROTO));
        for (String name : List.of("Forwarded", "X-Forwarded-Host", "X-Forwarded-Port", "X-Forwarded-Prefix")) headers.remove(name);
        return headers;
    }

    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();
        String method = request.getMethod().name();
        if (!OAuthPaths.publicEndpoint(method, path) && !OAuthPaths.resource(method, path)) return fail(exchange, 404, "invalid_request", "第三方授权接口不存在");
        String remote = request.getRemoteAddress() == null || request.getRemoteAddress().getAddress() == null ? "unknown" : request.getRemoteAddress().getAddress().getHostAddress();
        try {
            policy.transport("https".equalsIgnoreCase(request.getURI().getScheme()), remote, request.getHeaders().getFirst("X-Forwarded-Proto"));
        } catch (OAuthFailure failure) { return fail(exchange, failure.getCode(), failure.getError(), failure.getMessage()); }
        String resolved = IpUtils.isTrustedProxy(remote)
                ? com.cloudflow.common.security.portal.PortalClientAddress.resolve(remote, request.getHeaders().getFirst("X-Forwarded-For")) : remote;
        String proto = "https".equalsIgnoreCase(request.getURI().getScheme())
                || IpUtils.isTrustedProxy(remote) && "https".equalsIgnoreCase(request.getHeaders().getFirst("X-Forwarded-Proto")) ? "https" : "http";
        exchange.getAttributes().put(CLIENT, resolved);
        exchange.getAttributes().put(PROTO, proto);
        if (OAuthPaths.publicEndpoint(method, path)) return forward(exchange, chain, null);
        List<String> supplied = request.getHeaders().get("Authorization");
        if (supplied == null || supplied.size() != 1 || !supplied.get(0).startsWith("Bearer ")) return invalid(exchange);
        String raw = supplied.get(0).substring(7);
        if (!OAuthDigests.token(raw)) return invalid(exchange);
        String hash = OAuthDigests.hash(raw);
        return client.post().uri("http://cloudflow-auth/inner/auth/oauth2/verify")
                .contentType(MediaType.APPLICATION_JSON).bodyValue(Map.of("tokenHash", hash, "scope", OAuthPaths.scope(path))).retrieve()
                .onStatus(status -> status.value() == 401, response -> Mono.just(OAuthFailure.unauthenticated()))
                .onStatus(status -> status.value() == 403, response -> Mono.just(OAuthFailure.forbidden()))
                .bodyToMono(new ParameterizedTypeReference<R<OAuthIdentity>>() { }).timeout(Duration.ofSeconds(3))
                .flatMap(result -> {
                    OAuthIdentity identity = result == null || !result.isSuccess() ? null : result.getData();
                    if (identity == null || !hash.equals(identity.tokenHash())) return invalid(exchange);
                    if (!identity.scopes().contains(OAuthPaths.scope(path))) return fail(exchange, 403, "insufficient_scope", "第三方授权不包含此项访问");
                    return Mono.fromCallable(() -> { tokens.project(identity); return identity; }).subscribeOn(Schedulers.boundedElastic())
                            .flatMap(verified -> forward(exchange, chain, verified));
                }).onErrorResume(failure -> failure instanceof OAuthFailure oauth
                        ? fail(exchange, oauth.getCode(), oauth.getError(), oauth.getMessage())
                        : fail(exchange, 503, "temporarily_unavailable", "第三方授权核验暂不可用"));
    }

    private Mono<Void> forward(ServerWebExchange exchange, GatewayFilterChain chain, OAuthIdentity identity) {
        if (identity != null) exchange.getAttributes().put(TraceGlobalFilter.IDENTITY, new TraceGlobalFilter.Identity(identity.tenantId(), "oauth2:" + identity.userId()));
        ServerHttpRequest request = exchange.getRequest().mutate().headers(headers -> {
            for (String name : List.of("Cookie", "portal-token", "oauth2-session", "X-Auth-Token", "X-User-Id", "X-User-Name",
                    "X-User-Roles", "X-User-Dept-Name", "X-User-Tenant-Id", SecurityConstants.TENANT_ID_HEADER,
                    SecurityConstants.INNER_CALL_HEADER, SecurityConstants.FROM_SERVICE_HEADER, "Forwarded",
                    "X-Forwarded-Host", "X-Forwarded-Ssl", "X-Real-IP", "Proxy-Client-IP", "WL-Proxy-Client-IP", "HTTP_CLIENT_IP", "HTTP_X_FORWARDED_FOR")) headers.remove(name);
            headers.set("X-Forwarded-For", exchange.getAttribute(CLIENT));
            headers.set("X-Forwarded-Proto", exchange.getAttribute(PROTO));
            if (identity != null) headers.set(SecurityConstants.TENANT_ID_HEADER, identity.tenantId().toString());
        }).build();
        exchange.getResponse().getHeaders().setCacheControl("no-store");
        exchange.getResponse().getHeaders().set("Referrer-Policy", "no-referrer");
        return chain.filter(exchange.mutate().request(request).build());
    }

    private Mono<Void> invalid(ServerWebExchange exchange) { return fail(exchange, 401, "invalid_token", "第三方授权已失效，请重新授权"); }

    private Mono<Void> fail(ServerWebExchange exchange, int status, String error, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatusCode.valueOf(status));
        response.getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        response.getHeaders().setCacheControl("no-store");
        response.getHeaders().set("Referrer-Policy", "no-referrer");
        if (status == 401) response.getHeaders().set("WWW-Authenticate", "Bearer error=\"" + error + "\"");
        try {
            byte[] body = json.writeValueAsBytes(Map.of("error", error, "error_description", message));
            return response.writeWith(Mono.just(response.bufferFactory().wrap(body)));
        } catch (JsonProcessingException impossible) { return response.setComplete(); }
    }
}
