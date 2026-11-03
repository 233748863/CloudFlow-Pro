package com.cloudflow.common.audit.support;

/** 单次审计调用内复用业务快照；嵌套调用退出时恢复外层。 */
public final class AuditSnapshotContext {
    private static final ThreadLocal<Scope> CURRENT = new ThreadLocal<>();

    private AuditSnapshotContext() { }

    public static Scope open() {
        Scope scope = new Scope(CURRENT.get());
        CURRENT.set(scope);
        return scope;
    }

    public static void record(Object before, Object after) {
        Scope scope = CURRENT.get();
        if (scope != null) scope.snapshots = new Snapshots(before, after);
    }

    public static Snapshots current() {
        Scope scope = CURRENT.get();
        return scope == null ? null : scope.snapshots;
    }

    public record Snapshots(Object before, Object after) { }

    public static final class Scope implements AutoCloseable {
        private final Scope previous;
        private Snapshots snapshots;

        private Scope(Scope previous) { this.previous = previous; }

        @Override
        public void close() {
            if (previous == null) CURRENT.remove();
            else CURRENT.set(previous);
        }
    }
}
