package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.gateway.acl.BlacklistFilter;
import com.cloudflow.gateway.acl.IpAclSnapshot;
import com.cloudflow.gateway.config.GatewayAuthProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.gateway.config.HttpClientProperties;
import org.springframework.cloud.gateway.filter.NettyRoutingFilter;
import org.springframework.cloud.gateway.filter.NettyWriteResponseFilter;
import org.springframework.cloud.gateway.filter.OrderedGatewayFilter;
import org.springframework.cloud.gateway.filter.RouteToRequestUrlFilter;
import org.springframework.cloud.gateway.filter.factory.StripPrefixGatewayFilterFactory;
import org.springframework.cloud.gateway.filter.headers.ForwardedHeadersFilter;
import org.springframework.cloud.gateway.filter.headers.HttpHeadersFilter;
import org.springframework.cloud.gateway.filter.headers.XForwardedHeadersFilter;
import org.springframework.cloud.gateway.handler.FilteringWebHandler;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.core.annotation.AnnotationAwareOrderComparator;
import org.springframework.http.server.reactive.ReactorHttpHandlerAdapter;
import org.springframework.web.server.adapter.HttpWebHandlerAdapter;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

public final class ImLoginGatewayChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AtomicInteger ASSERTIONS = new AtomicInteger();
    private static final AtomicInteger FORWARDED = new AtomicInteger();
    private static int requests;
    private static URI origin;
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    private static final String BROWSER = "a".repeat(43);
    private static final String MFA = "b".repeat(43);

    public static void main(String[] arguments) throws Exception {
        ImLoginGatewayAccess access = new ImLoginGatewayAccess();
        List<HttpHeadersFilter> headers = new ArrayList<>(List.of(access, new ForwardedHeadersFilter(), new XForwardedHeadersFilter()));
        AnnotationAwareOrderComparator.sort(headers);
        check(headers.get(headers.size() - 1) == access, "IM headers normalized after actual framework header filters");
        ObjectProvider<List<HttpHeadersFilter>> provider = new ObjectProvider<>() {
            @Override public List<HttpHeadersFilter> getObject(Object... args) { return headers; }
            @Override public List<HttpHeadersFilter> getIfAvailable() { return headers; }
            @Override public List<HttpHeadersFilter> getIfUnique() { return headers; }
            @Override public List<HttpHeadersFilter> getObject() { return headers; }
        };
        AuthFilter auth = new AuthFilter();
        inject(auth, "authProperties", new GatewayAuthProperties() {
            @Override public List<String> effectiveWhitelist() { return List.of("/auth/login"); }
        });
        inject(auth, "tokenService", new TokenService() {
            @Override public Map<String, Object> verifyToken(String token) { return null; }
        });
        BlacklistFilter blacklist = new BlacklistFilter();
        IpAclSnapshot blocked = new IpAclSnapshot(); blocked.setRuleCode("owned-ip-rule"); blocked.setIpPattern("203.0.113.9"); blocked.setRuleType("EXACT"); blocked.setMode("BLACK"); blocked.setStatus("ACTIVE");
        inject(blacklist, "activeRulesRef", new AtomicReference<>(List.of(blocked)));
        DisposableServer downstream = HttpServer.create().host("127.0.0.1").port(0).handle((request, response) -> {
            FORWARDED.incrementAndGet();
            try {
                Map<String, Object> result = Map.of("path", URI.create(request.uri()).getPath(), "method", request.method().name(), "headers", request.requestHeaders().entries().stream()
                        .collect(java.util.stream.Collectors.groupingBy(entry -> entry.getKey().toLowerCase(java.util.Locale.ROOT), java.util.stream.Collectors.mapping(Map.Entry::getValue, java.util.stream.Collectors.toList()))));
                return response.header("Content-Type", "application/json").sendString(Mono.just(JSON.writeValueAsString(result)));
            } catch (Exception failure) { return Mono.error(failure); }
        }).bindNow(Duration.ofSeconds(10));
        StripPrefixGatewayFilterFactory strip = new StripPrefixGatewayFilterFactory();
        StripPrefixGatewayFilterFactory.Config stripConfig = new StripPrefixGatewayFilterFactory.Config(); stripConfig.setParts(1);
        Route route = Route.async().id("owned-auth-route").uri("http://127.0.0.1:" + downstream.port()).predicate(exchange -> true).filter(new OrderedGatewayFilter(strip.apply(stripConfig), 1)).build();
        HttpClientProperties clientProperties = new HttpClientProperties(); clientProperties.setResponseTimeout(Duration.ofSeconds(10));
        FilteringWebHandler chain = new FilteringWebHandler(List.of(new InnerPathBlockFilter(), new ImLoginGatewayFilter(access), blacklist,
                new CookieCsrfFilter(), auth, new RouteToRequestUrlFilter(), new NettyWriteResponseFilter(List.of()),
                new NettyRoutingFilter(reactor.netty.http.client.HttpClient.create(), provider, clientProperties)));
        HttpWebHandlerAdapter handler = new HttpWebHandlerAdapter(exchange -> {
            exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR, route);
            return chain.handle(exchange);
        });
        DisposableServer gateway = HttpServer.create().host("127.0.0.1").port(0).handle(new ReactorHttpHandlerAdapter(handler)).bindNow(Duration.ofSeconds(10));
        origin = URI.create("http://127.0.0.1:" + gateway.port());
        IpUtils.setTrustedProxies(List.of("127.0.0.1/32"));
        try {
            for (String path : List.of("/availability", "/auth-url", "/callback", "/totp", "/binding-callback")) {
                String method = path.equals("/totp") ? "POST" : "GET";
                HttpResponse<String> response = send(method, "/auth/im/WECOM" + path, "https", "198.51.100.7", "Authorization=old-account; XSRF-TOKEN=old-csrf; __Host-CloudFlowIM=" + BROWSER + "; __Host-CloudFlowIMMfa=" + MFA, 200);
                JsonNode result = JSON.readTree(response.body()); JsonNode forwarded = result.path("headers");
                check(result.path("path").asText().equals("/im/WECOM" + path), "actual StripPrefix preserves exact downstream endpoint: " + result.path("path").asText());
                check(forwarded.path("x-forwarded-proto").size() == 1 && forwarded.path("x-forwarded-proto").get(0).asText().equals("https"), "actual Netty routing forwards single verified HTTPS");
                check(forwarded.path("x-forwarded-for").size() == 1 && forwarded.path("x-forwarded-for").get(0).asText().equals("198.51.100.7"), "actual Netty routing forwards true client address");
                for (String name : List.of("authorization", "x-auth-token", "x-user-id", "x-user-name", "x-user-roles", "x-user-dept-name", "x-user-tenant-id", "x-tenant-id", "x-inner-call", "x-from-service", "forwarded", "x-forwarded-host", "x-forwarded-port", "x-forwarded-prefix", "x-real-ip")) {
                    check(!forwarded.has(name), "upstream excludes " + name);
                }
                String cookies = forwarded.path("cookie").get(0).asText();
                check(cookies.contains("__Host-CloudFlowIM=" + BROWSER) && !cookies.contains("old-"), "only browser-bound cookies cross anonymous gateway");
                check(cookies.contains("__Host-CloudFlowIMMfa=" + MFA) != path.equals("/binding-callback"), "binding callback excludes unrelated login MFA proof");
            }
            for (String method : List.of("GET", "POST")) {
                JsonNode result = JSON.readTree(send(method, "/auth/im/callback/992801", "https", "198.51.100.7",
                        "Authorization=old-account; __Host-CloudFlowIM=" + BROWSER + "; __Host-CloudFlowIMMfa=" + MFA, 200).body());
                check(result.path("path").asText().equals("/im/callback/992801"), "provider callback exact downstream route");
                JsonNode forwarded = result.path("headers");
                for (String name : List.of("cookie", "authorization", "x-auth-token", "x-user-id", "x-user-name", "x-user-roles", "x-user-tenant-id", "x-tenant-id", "x-inner-call", "x-from-service")) {
                    check(!forwarded.has(name), "provider callback excludes ambient identity " + name);
                }
                check(forwarded.path("x-forwarded-for").size() == 1 && forwarded.path("x-forwarded-for").get(0).asText().equals("198.51.100.7"), "provider callback preserves verified source");
                check(forwarded.path("x-forwarded-proto").size() == 1 && forwarded.path("x-forwarded-proto").get(0).asText().equals("https"), "provider callback preserves verified transport");
            }
            int before = FORWARDED.get();
            for (String path : List.of("/auth/im/callback/0", "/auth/im/callback/01", "/auth/im/callback/-1", "/auth/im/callback/9223372036854775808", "/auth/im/callback/992801/", "/auth/im/callback/%3992801", "/auth/im/callback/992801;ignored")) {
                send("POST", path, "https", "198.51.100.7", null, 404);
            }
            for (String method : List.of("HEAD", "PUT", "DELETE")) send(method, "/auth/im/callback/992801", "https", "198.51.100.7", null, 404);
            send("POST", "/auth/im/callback/992801", "http", "198.51.100.7", null, 403);
            send("POST", "/auth/im/callback/992801", "https", "198.51.100.7,203.0.113.9", null, 403);
            for (String proto : List.of("http", "https,http", "")) send("GET", "/auth/im/WECOM/availability", proto, "198.51.100.7", null, 403);
            send("GET", "/auth/im/WECOM/callback", "https", "198.51.100.7,203.0.113.9", null, 403);
            send("GET", "/auth/im/WECOM/callback", "https", "host.example.test", null, 403);
            send("GET", "/auth/im/WECOM/callback", "https", "198.51.100.7", "__Host-CloudFlowIM=" + BROWSER + "; __Host-CloudFlowIM=" + MFA, 403);
            send("GET", "/auth/im/WECOM/callback", "https", "198.51.100.7", "__Host-CloudFlowIM=" + BROWSER + "; __Host-CloudFlowIM=" + BROWSER, 403);
            send("POST", "/auth/im/WECOM/totp", "https", "198.51.100.7", "__Host-CloudFlowIMMfa=invalid", 403);
            IpUtils.setTrustedProxies(List.of());
            send("GET", "/auth/im/WECOM/availability", "https", "198.51.100.7", null, 403);
            IpUtils.setTrustedProxies(List.of("127.0.0.1/32"));
            for (String path : List.of("/auth/im/WECOM/callback/", "/auth/im/WECOM/unknown", "/auth/im/WECOM/%63allback", "/auth/im/WECOM/callback;ignored", "/auth/im")) send("GET", path, "https", "198.51.100.7", null, 404);
            send("POST", "/auth/im/WECOM/callback", "https", "198.51.100.7", null, 404);
            send("GET", "/auth/im/WECOM/totp", "https", "198.51.100.7", null, 404);
            send("HEAD", "/auth/im/WECOM/auth-url", "https", "198.51.100.7", null, 404);
            send("POST", "/auth/im/WECOM/binding-callback", "https", "198.51.100.7", null, 404);
            send("GET", "/auth/im/WECOM/binding-callback/", "https", "198.51.100.7", null, 404);
            check(FORWARDED.get() == before, "all transport path method and cookie rejections precede upstream routing");
            send("POST", "/auth/login", "http", "198.51.100.7", null, 200);
            send("GET", "/auth/protected-check", "https", "198.51.100.7", null, 401);
            check(FORWARDED.get() == before + 1, "ordinary login remains anonymous and ordinary business requires authentication");
            send("POST", "/auth/system/im/binding/mine/confirm", "https", "198.51.100.7", null, 401);
            send("POST", "/auth/system/im/binding/mine/confirm", "https", "198.51.100.7", "Authorization=old-account; XSRF-TOKEN=old-csrf", 403);
            System.out.println("G4_IM_LOGIN_GATEWAY_HTTP: assertions=" + ASSERTIONS + "; requests=" + requests + "; failed=0; actual_filtering_web_handler=true; actual_netty_routing=true; actual_strip_prefix=true; actual_framework_headers=true; real_upstream_http=true; acl_rules=fixture; account_validation=fixture; vendor_service=false");
        } finally { gateway.disposeNow(); downstream.disposeNow(); IpUtils.setTrustedProxies(List.of()); }
    }

    private static HttpResponse<String> send(String method, String path, String proto, String address, String cookie, int expected) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(15)).method(method, HttpRequest.BodyPublishers.noBody())
                .header("X-Forwarded-Proto", proto).header("X-Forwarded-For", address).header("Forwarded", "for=192.0.2.9;proto=http;host=foreign.example.test")
                .header("Authorization", "Bearer old-account").header("X-User-Id", "forged").header("X-User-Name", "forged")
                .header("X-User-Roles", "ADMIN").header("X-User-Dept-Name", "forged").header("X-User-Tenant-Id", "1").header("X-Auth-Token", "forged")
                .header(SecurityConstants.TENANT_ID_HEADER, "1").header(SecurityConstants.INNER_CALL_HEADER, "true").header(SecurityConstants.FROM_SERVICE_HEADER, "forged")
                .header("X-Real-IP", "192.0.2.9").header("X-Forwarded-Host", "foreign.example.test");
        if (cookie != null) builder.header("Cookie", cookie);
        HttpResponse<String> response = HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString()); requests++;
        check(response.statusCode() == expected, method + " " + path + " expected=" + expected + " actual=" + response.statusCode());
        if (path.startsWith("/auth/im")) {
            check(response.headers().firstValue("cache-control").orElse("").equals("no-store"), "gateway IM response never cached");
            check(response.headers().firstValue("referrer-policy").orElse("").equals("no-referrer"), "gateway IM response no-referrer");
        }
        return response;
    }
    private static void inject(Object target, String name, Object value) throws Exception { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value); }
    private static void check(boolean success, String message) { ASSERTIONS.incrementAndGet(); if (!success) throw new AssertionError(message); }
}
