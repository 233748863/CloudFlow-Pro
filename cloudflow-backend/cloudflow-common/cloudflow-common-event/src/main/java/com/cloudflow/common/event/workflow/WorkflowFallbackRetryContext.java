package com.cloudflow.common.event.workflow;

public final class WorkflowFallbackRetryContext {

    private static final ThreadLocal<Boolean> RETRYING = ThreadLocal.withInitial(() -> false);

    private WorkflowFallbackRetryContext() {
    }

    public static boolean isRetrying() {
        return Boolean.TRUE.equals(RETRYING.get());
    }

    public static void runRetrying(Runnable runnable) {
        RETRYING.set(true);
        try {
            runnable.run();
        } finally {
            RETRYING.remove();
        }
    }
}
