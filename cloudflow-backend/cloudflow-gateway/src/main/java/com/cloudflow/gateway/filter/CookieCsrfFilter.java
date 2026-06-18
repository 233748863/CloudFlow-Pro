package com.cloudflow.gateway.filter;

import com.cloudflow.common.security.cookie.AuthCookieSupport;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Protects cookie-authenticated browser writes from CSRF.
 */
@Component
public class CookieCsrfFilter implements GlobalFilter, Ordered {

    private static final Set<HttpMethod> UNSAFE_METHODS = Set.of(
            HttpMethod.POST,
            HttpMethod.PUT,
            HttpMethod.PATCH,
            HttpMethod.DELETE
    );

    private static final List<String> EXCLUDE_PATHS = List.of(
            "/auth/login",
            "/auth/register",
            "/auth/captcha/**",
            "/auth/tenant/options",
            "/ws/**"
    );

    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        if (shouldSkip(request)) {
            return chain.filter(exchange);
        }

        String csrfCookie = cookieValue(exchange, AuthCookieSupport.CSRF_COOKIE_NAME);
        String csrfHeader = request.getHeaders().getFirst(AuthCookieSupport.CSRF_HEADER_NAME);

        if (StringUtils.hasText(csrfCookie)) {
            return constantTimeEquals(csrfCookie, csrfHeader)
                    ? chain.filter(exchange)
                    : forbidden(exchange);
        }

        return isSameSiteRequest(request) ? chain.filter(exchange) : forbidden(exchange);
    }

    private boolean shouldSkip(ServerHttpRequest request) {
        if (request == null || request.getMethod() == null) {
            return true;
        }
        if (!UNSAFE_METHODS.contains(request.getMethod())) {
            return true;
        }
        String path = request.getURI().getPath();
        for (String pattern : EXCLUDE_PATHS) {
            if (pathMatcher.match(pattern, path)) {
                return true;
            }
        }
        return !StringUtils.hasText(cookieValue(request, AuthCookieSupport.AUTH_COOKIE_NAME));
    }

    private Mono<Void> forbidden(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
        exchange.getResponse().getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        String body = "{\"code\":403,\"msg\":\"CSRF校验失败，请刷新页面后重试\"}";
        DataBuffer buffer = exchange.getResponse().bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    private boolean isSameSiteRequest(ServerHttpRequest request) {
        String origin = request.getHeaders().getOrigin();
        if (StringUtils.hasText(origin)) {
            return sameHost(request, origin);
        }

        String referer = request.getHeaders().getFirst("Referer");
        if (StringUtils.hasText(referer)) {
            return sameHost(request, referer);
        }

        String fetchSite = request.getHeaders().getFirst("Sec-Fetch-Site");
        return fetchSite == null
                || "same-origin".equalsIgnoreCase(fetchSite)
                || "same-site".equalsIgnoreCase(fetchSite)
                || "none".equalsIgnoreCase(fetchSite);
    }

    private boolean sameHost(ServerHttpRequest request, String candidate) {
        try {
            URI candidateUri = URI.create(candidate);
            String candidateHost = normalizeHost(candidateUri.getHost());
            String requestHost = normalizeHost(request.getURI().getHost());
            return StringUtils.hasText(candidateHost) && candidateHost.equals(requestHost);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private String normalizeHost(String host) {
        return host == null ? "" : host.toLowerCase(Locale.ROOT);
    }

    private String cookieValue(ServerWebExchange exchange, String name) {
        return cookieValue(exchange.getRequest(), name);
    }

    private String cookieValue(ServerHttpRequest request, String name) {
        HttpCookie cookie = request.getCookies().getFirst(name);
        return cookie != null ? cookie.getValue() : null;
    }

    private boolean constantTimeEquals(String expected, String actual) {
        if (!StringUtils.hasText(expected) || !StringUtils.hasText(actual)) {
            return false;
        }
        byte[] left = expected.getBytes(StandardCharsets.UTF_8);
        byte[] right = actual.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(left, right);
    }

    @Override
    public int getOrder() {
        return -110;
    }
}
