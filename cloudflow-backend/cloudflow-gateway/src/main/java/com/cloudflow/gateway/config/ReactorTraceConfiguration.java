package com.cloudflow.gateway.config;

import com.cloudflow.common.core.context.TraceContext;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.reactivestreams.Subscription;
import org.slf4j.MDC;
import org.springframework.context.annotation.Configuration;
import reactor.core.CoreSubscriber;
import reactor.core.publisher.Hooks;
import reactor.core.publisher.Operators;
import reactor.util.context.Context;

@Configuration
public class ReactorTraceConfiguration {
    private static final String HOOK = "cloudflow-trace-mdc";

    @PostConstruct
    public void register() {
        Hooks.onEachOperator(HOOK, Operators.lift((source, subscriber) -> new TraceSubscriber<>(subscriber)));
    }

    @PreDestroy
    public void close() {
        Hooks.resetOnEachOperator(HOOK);
    }

    private record TraceSubscriber<Value>(CoreSubscriber<? super Value> delegate) implements CoreSubscriber<Value> {
        @Override
        public Context currentContext() { return delegate.currentContext(); }

        @Override
        public void onSubscribe(Subscription subscription) { scoped(() -> delegate.onSubscribe(subscription)); }

        @Override
        public void onNext(Value value) { scoped(() -> delegate.onNext(value)); }

        @Override
        public void onError(Throwable failure) { scoped(() -> delegate.onError(failure)); }

        @Override
        public void onComplete() { scoped(delegate::onComplete); }

        private void scoped(Runnable action) {
            String previous = MDC.get(TraceContext.MDC_KEY);
            String traceId = currentContext().getOrDefault(TraceContext.MDC_KEY, null);
            if (TraceContext.isValid(traceId)) MDC.put(TraceContext.MDC_KEY, traceId); else MDC.remove(TraceContext.MDC_KEY);
            try {
                action.run();
            } finally {
                if (previous == null) MDC.remove(TraceContext.MDC_KEY); else MDC.put(TraceContext.MDC_KEY, previous);
            }
        }
    }
}
