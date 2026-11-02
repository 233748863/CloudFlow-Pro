package com.cloudflow.common.audit.support;

/** 当前审计调用复用业务已经读取的前后记录，结束时恢复嵌套调用的记录。 */
public final class AuditChangeScope implements AutoCloseable {
    private static final ThreadLocal<AuditChangeScope> CURRENT = new ThreadLocal<>();
    private final AuditChangeScope previous;
    private Object before;
    private Object after;
    private boolean captured;

    private AuditChangeScope() {
        previous = CURRENT.get();
        CURRENT.set(this);
    }

    public static AuditChangeScope open() {
        return new AuditChangeScope();
    }

    public static void capture(Object before, Object after) {
        AuditChangeScope scope = CURRENT.get();
        if (scope != null) {
            scope.before = before;
            scope.after = after;
            scope.captured = true;
        }
    }

    public boolean captured() { return captured; }
    public Object before() { return before; }
    public Object after() { return after; }

    @Override
    public void close() {
        if (previous == null) {
            CURRENT.remove();
        } else {
            CURRENT.set(previous);
        }
    }
}
