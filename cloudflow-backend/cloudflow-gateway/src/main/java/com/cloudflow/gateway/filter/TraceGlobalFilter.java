package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.domain.GatewayRequestLog;
import com.cloudflow.common.core.utils.LogSanitizer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
@RequiredArgsConstructor
@Slf4j
public class TraceGlobalFilter implements GlobalFilter, Ordered {
    public static final String IDENTITY = TraceGlobalFilter.class.getName() + ".identity";
    private final GatewayLogForwarder forwarder;

    public record Identity(Long tenantId, String userName) {
    }
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String traceId = TraceContext.normalize(exchange.getRequest().getHeaders().getFirst(TraceContext.HEADER));
        long start = System.nanoTime();
        LocalDateTime startedAt = LocalDateTime.now();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        exchange.getResponse().getHeaders().set(TraceContext.HEADER, traceId);
        exchange.getResponse().beforeCommit(() -> {
            exchange.getResponse().getHeaders().set(TraceContext.HEADER, traceId);
            return Mono.empty();
        });
        ServerWebExchange traced = exchange.mutate().request(request -> request.headers(headers -> headers.set(TraceContext.HEADER, traceId))).build();
        return chain.filter(traced).doOnError(failure::set).doFinally(signal -> {
            Identity identity = exchange.getAttributeOrDefault(IDENTITY, new Identity(0L, null));
            Throwable exception = failure.get();
            int status = exchange.getResponse().getStatusCode() == null ? 200 : exchange.getResponse().getStatusCode().value();
            if (exception != null) status = 500;
            if (signal == reactor.core.publisher.SignalType.CANCEL) status = 499;
            long duration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
            String path = LogSanitizer.limit(exchange.getRequest().getURI().getPath(), 500);
            if (com.cloudflow.common.security.oauth2.OAuthPaths.namespace(path) || path.startsWith("/auth/system/oauth2/")
                    || path.startsWith("/system/oauth2/")) path = "/oauth2/**";
            log.info("网关请求结束: traceId={}, method={}, path={}, status={}, durationMs={}", traceId, exchange.getRequest().getMethod(), path, status, duration);
            forwarder.offer(new GatewayRequestLog(identity.tenantId(), traceId, identity.userName(),
                    exchange.getRequest().getMethod().name(), path, duration, status,
                    exchange.getRequest().getRemoteAddress() == null ? null : exchange.getRequest().getRemoteAddress().getAddress().getHostAddress(),
                    LogSanitizer.limit(exchange.getRequest().getHeaders().getFirst("User-Agent"), 500), startedAt,
                    exception == null ? null : LogSanitizer.limit(exception.getClass().getName(), 200),
                    exception == null ? null : LogSanitizer.limit(exception.getMessage(), 2000),
                    exception == null ? null : LogSanitizer.stack(exception)));
        }).contextWrite(context -> context.put(TraceContext.MDC_KEY, traceId));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }
}
