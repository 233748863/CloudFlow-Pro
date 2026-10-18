package com.cloudflow.common.core.context;

import org.slf4j.MDC;
import java.util.UUID;
import java.util.regex.Pattern;

public final class TraceContext {
    public static final String HEADER = "X-Trace-Id";
    public static final String MDC_KEY = "traceId";
    private static final Pattern VALID = Pattern.compile("[A-Za-z0-9_-]{16,64}");

    private TraceContext() {
    }

    public static boolean isValid(String value) {
        return value != null && VALID.matcher(value).matches();
    }

    public static String normalize(String value) {
        return isValid(value) ? value : UUID.randomUUID().toString().replace("-", "");
    }

    public static String currentOrCreate() {
        String traceId = normalize(MDC.get(MDC_KEY));
        MDC.put(MDC_KEY, traceId);
        return traceId;
    }

    public static Scope scope() {
        String previous = MDC.get(MDC_KEY);
        currentOrCreate();
        return new Scope(previous);
    }

    public record Scope(String previous) implements AutoCloseable {
        @Override
        public void close() {
            if (previous == null) MDC.remove(MDC_KEY); else MDC.put(MDC_KEY, previous);
        }
    }
}
