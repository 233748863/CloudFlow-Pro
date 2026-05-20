package com.cloudflow.gateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.autoconfigure.web.ManagementContextConfiguration;
import org.springframework.boot.actuate.autoconfigure.web.ManagementContextType;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@ManagementContextConfiguration(value = ManagementContextType.CHILD)
public class PrometheusScrapeReactiveFilter {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public WebFilter prometheusMetricsAuthWebFilter(
            @Value("${cloudflow.security.prometheus.enabled:false}") boolean enabled,
            @Value("${cloudflow.security.prometheus.username:prometheus}") String username,
            @Value("${cloudflow.security.prometheus.password:}") String password,
            @Value("${cloudflow.security.prometheus.realm:prometheus-metrics}") String realm) {
        if (!enabled) {
            return (exchange, chain) -> chain.filter(exchange);
        }
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            throw new IllegalStateException("cloudflow.security.prometheus 已启用，但 username/password 未配置完整");
        }
        String expectedAuthorization = buildExpectedAuthorization(username, password);
        return (exchange, chain) -> {
            if (!isPrometheusPath(exchange)) {
                return chain.filter(exchange);
            }
            String authorization = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
            if (expectedAuthorization.equals(authorization)) {
                return chain.filter(exchange);
            }
            return writeUnauthorized(exchange, realm);
        };
    }


    private boolean isPrometheusPath(ServerWebExchange exchange) {
        return "/actuator/prometheus".equals(exchange.getRequest().getPath().value());
    }

    private String buildExpectedAuthorization(String username, String password) {
        String credentials = username + ":" + password;
        String encoded = Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
        return "Basic " + encoded;
    }

    private Mono<Void> writeUnauthorized(ServerWebExchange exchange, String realm) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        exchange.getResponse().getHeaders().set(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"" + realm + "\"");
        exchange.getResponse().getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        byte[] body = "{\"code\":401,\"msg\":\"prometheus scrape unauthorized\"}".getBytes(StandardCharsets.UTF_8);
        return exchange.getResponse().writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(body)));
    }
}
