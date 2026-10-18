package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.domain.GatewayRequestLog;
import com.cloudflow.common.core.domain.R;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.Disposable;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

@Component
@Slf4j
public class GatewayLogForwarder {
    private final WebClient client;
    private final Sinks.Many<GatewayRequestLog> queue = Sinks.many().multicast().onBackpressureBuffer(1000, false);
    private final CountDownLatch drained = new CountDownLatch(1);
    private Disposable subscription;

    public GatewayLogForwarder(@Qualifier("tenantStatusWebClientBuilder") WebClient.Builder builder) {
        this.client = builder.clone().build();
    }

    @PostConstruct
    public void start() {
        subscription = queue.asFlux().flatMap(this::deliver, 4, 1).doFinally(signal -> drained.countDown())
                .subscribe(ignored -> {}, failure -> log.error("网关日志队列停止: {}", failure.getClass().getSimpleName()));
    }

    public synchronized void offer(GatewayRequestLog entry) {
        if (queue.tryEmitNext(entry).isFailure()) log.warn("网关日志队列已满: traceId={}", entry.traceId());
    }

    private Mono<Void> deliver(GatewayRequestLog entry) {
        return client.post().uri("http://cloudflow-auth/inner/auth/observability/access")
                .header(TraceContext.HEADER, entry.traceId())
                .header(SecurityConstants.TENANT_ID_HEADER, String.valueOf(entry.tenantId()))
                .bodyValue(entry).retrieve().bodyToMono(R.class).timeout(Duration.ofSeconds(5))
                .flatMap(result -> result.getCode() == 200 ? Mono.<Void>empty() : Mono.error(new IllegalStateException("日志接收失败")))
                .onErrorResume(failure -> {
                    log.warn("网关日志投递失败: traceId={}, exception={}", entry.traceId(), failure.getClass().getSimpleName());
                    return Mono.empty();
                });
    }

    @PreDestroy
    public void close() {
        queue.tryEmitComplete();
        try {
            if (!drained.await(30, TimeUnit.SECONDS) && subscription != null) subscription.dispose();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            if (subscription != null) subscription.dispose();
        }
    }
}
