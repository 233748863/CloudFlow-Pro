package com.cloudflow.auth.im;

import java.time.Duration;
import java.util.function.Supplier;

final class ImSyncBudget {
    private static final ThreadLocal<Long> DEADLINE = new ThreadLocal<>();

    private ImSyncBudget() { }

    static boolean active() { return DEADLINE.get() != null; }

    static <Result> Result within(long deadline, Supplier<Result> operation) {
        Long previous = DEADLINE.get();
        DEADLINE.set(previous == null ? deadline : Math.min(previous, deadline));
        try { check(); return operation.get(); }
        finally {
            if (previous == null) DEADLINE.remove();
            else DEADLINE.set(previous);
        }
    }

    static void check() {
        Long deadline = DEADLINE.get();
        if (Thread.currentThread().isInterrupted() || deadline != null && deadline - System.nanoTime() <= 0) throw new Exhausted();
    }

    static Duration limit(Duration requested) {
        check();
        Long deadline = DEADLINE.get();
        if (deadline == null) return requested;
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) throw new Exhausted();
        return Duration.ofNanos(Math.min(remaining, requested.toNanos()));
    }

    static final class Exhausted extends RuntimeException {
        private static final long serialVersionUID = 1L;
        Exhausted() { super("IM_SYNC_BUDGET_EXHAUSTED"); }
    }
}
