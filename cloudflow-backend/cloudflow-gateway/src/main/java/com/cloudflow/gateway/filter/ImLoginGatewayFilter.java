package com.cloudflow.gateway.filter;

import lombok.RequiredArgsConstructor;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
@RequiredArgsConstructor
public class ImLoginGatewayFilter implements GlobalFilter, Ordered {
    private final ImLoginGatewayAccess access;
    @Override public int getOrder() { return -190; }
    @Override public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) { return access.filter(exchange, chain); }
}
