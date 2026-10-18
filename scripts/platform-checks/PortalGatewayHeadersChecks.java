package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.portal.PortalAccessPolicy;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.cloud.gateway.filter.headers.ForwardedHeadersFilter;
import org.springframework.cloud.gateway.filter.headers.HttpHeadersFilter;
import org.springframework.cloud.gateway.filter.headers.XForwardedHeadersFilter;
import org.springframework.core.annotation.AnnotationAwareOrderComparator;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ReactorHttpHandlerAdapter;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.web.server.adapter.HttpWebHandlerAdapter;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

public final class PortalGatewayHeadersChecks {
    private static final AtomicInteger CHECKS = new AtomicInteger();

    public static void main(String[] arguments) throws Exception {
        PortalAccessPolicy policy = new PortalAccessPolicy(true, "https://portal.example.test");
        PortalGatewayAccess portal = new PortalGatewayAccess(policy, null, null, new ObjectMapper());
        List<HttpHeadersFilter> defaults = List.of(new ForwardedHeadersFilter(), new XForwardedHeadersFilter());
        List<HttpHeadersFilter> filters = new ArrayList<>(List.of(portal, defaults.get(0), defaults.get(1)));
        AnnotationAwareOrderComparator.sort(filters);
        check(filters.get(filters.size() - 1) == portal, "portal header boundary runs after the installed framework forwarding filters");
        check(portal.supports(HttpHeadersFilter.Type.REQUEST) && !portal.supports(HttpHeadersFilter.Type.RESPONSE), "portal header boundary applies only to upstream requests");
        AtomicInteger forwarded = new AtomicInteger();
        IpUtils.setTrustedProxies(List.of("127.0.0.1/32"));
        HttpWebHandlerAdapter handler = new HttpWebHandlerAdapter(incoming -> {
            if ("/internal-check".equals(incoming.getRequest().getURI().getPath())) {
                HttpHeaders input = incoming.getRequest().getHeaders();
                check(portal.filter(input, incoming) == input, "ordinary internal forwarding remains unchanged without a verified portal marker");
                incoming.getResponse().setStatusCode(HttpStatus.NO_CONTENT);
                return incoming.getResponse().setComplete();
            }
            ServerHttpRequestDecorator request = new ServerHttpRequestDecorator(incoming.getRequest()) {
                @Override
                public InetSocketAddress getRemoteAddress() {
                    return "untrusted".equals(getHeaders().getFirst("X-Unit-Source"))
                            ? new InetSocketAddress("127.0.0.2", 12345) : super.getRemoteAddress();
                }
            };
            return portal.filter(incoming.mutate().request(request).build(), exchange -> {
                HttpHeaders original = exchange.getRequest().getHeaders();
                HttpHeaders framework = HttpHeadersFilter.filterRequest(defaults, exchange);
                check("https,http".equals(framework.getFirst("X-Forwarded-Proto")), "installed framework reproduces the verified HTTPS plus internal HTTP ambiguity");
                check(framework.containsKey("Forwarded"), "installed framework generates a second forwarding representation");
                HttpHeaders upstream = HttpHeadersFilter.filterRequest(filters, exchange);
                check(List.of("https").equals(upstream.get("X-Forwarded-Proto")), "upstream portal receives exactly one verified HTTPS value");
                check(List.of("198.51.100.7").equals(upstream.get("X-Forwarded-For")), "upstream portal preserves the verified original client instead of an appended proxy hop");
                check(List.of("Forwarded", "X-Forwarded-Host", "X-Forwarded-Port", "X-Forwarded-Prefix").stream().noneMatch(upstream::containsKey),
                        "upstream portal has no conflicting framework forwarding alternatives");
                check(List.of("Authorization", "Cookie", "X-User-Id", SecurityConstants.TENANT_ID_HEADER,
                        SecurityConstants.INNER_CALL_HEADER, SecurityConstants.FROM_SERVICE_HEADER).stream().noneMatch(upstream::containsKey),
                        "framework header processing cannot restore forged internal identity");
                check(List.of("https").equals(original.get("X-Forwarded-Proto")), "final header boundary does not mutate the verified request header collection");
                policy.checkTransport(false, "127.0.0.1", upstream.getFirst("X-Forwarded-Proto"), upstream.getOrigin());
                forwarded.incrementAndGet();
                exchange.getResponse().setStatusCode(HttpStatus.NO_CONTENT);
                return exchange.getResponse().setComplete();
            });
        });
        DisposableServer server = HttpServer.create().host("127.0.0.1").port(0)
                .handle(new ReactorHttpHandlerAdapter(handler)).bindNow(Duration.ofSeconds(15));
        try {
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).version(HttpClient.Version.HTTP_1_1).build();
            URI address = URI.create("http://127.0.0.1:" + server.port() + "/portal/check/status");
            HttpResponse<String> valid = send(client, address, "https", "https://portal.example.test", false);
            check(valid.statusCode() == 204 && forwarded.get() == 1, "trusted proxy request passes the real header filter chain and downstream HTTPS policy");
            check(valid.headers().firstValue("cache-control").orElse("").equals("no-store"), "verified portal forwarding remains non-cacheable");
            for (String scheme : List.of("http", "https,http", "")) {
                check(send(client, address, scheme, "https://portal.example.test", false).statusCode() == 403 && forwarded.get() == 1,
                        "invalid incoming transport cannot acquire a verified portal marker");
            }
            check(send(client, address, "https", "https://foreign.example.test", false).statusCode() == 403 && forwarded.get() == 1,
                    "foreign origin remains rejected before header canonicalization");
            check(send(client, address, "https", "https://portal.example.test", true).statusCode() == 403 && forwarded.get() == 1,
                    "untrusted direct client cannot forge HTTPS through forwarded headers");
            check(send(client, address.resolve("/portal/check/status/"), "https", "https://portal.example.test", false).statusCode() == 404 && forwarded.get() == 1,
                    "unsupported portal path cannot acquire a verified marker");
            check(send(client, address.resolve("/internal-check"), "http", "https://foreign.example.test", false).statusCode() == 204,
                    "non-portal forwarding is unaffected");
        } finally {
            server.disposeNow(Duration.ofSeconds(5));
            IpUtils.setTrustedProxies(List.of());
        }
        System.out.println("PORTAL_GATEWAY_HEADERS_CHECKS: assertions=" + CHECKS.get()
                + "; failed=0; real_netty_http=true; installed_header_filters=true; trusted_proxy_input=true; mysql=false; redis=false; production_modified=false");
    }

    private static HttpResponse<String> send(HttpClient client, URI address, String scheme, String origin, boolean untrusted) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(address).timeout(Duration.ofSeconds(10)).header("Origin", origin)
                .header("X-Forwarded-Proto", scheme).header("X-Forwarded-For", "198.51.100.7")
                .header("Forwarded", "proto=http;for=203.0.113.99").header("X-Forwarded-Host", "foreign.example.test")
                .header("X-Unit-Source", untrusted ? "untrusted" : "trusted").header("Authorization", "Bearer forged")
                .header("Cookie", "Authorization=forged").header("X-User-Id", "1")
                .header(SecurityConstants.TENANT_ID_HEADER, "100001").header(SecurityConstants.INNER_CALL_HEADER, "true")
                .header(SecurityConstants.FROM_SERVICE_HEADER, "cloudflow-auth").GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        CHECKS.incrementAndGet();
    }
}
