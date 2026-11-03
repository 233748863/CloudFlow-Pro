package com.cloudflow.common.audit.support;

import org.javers.core.Changes;
import org.javers.core.Javers;
import org.javers.core.JaversBuilder;

/** 字段比较工具；比较错误交给调用方记录，不能伪装成无变更。 */
public final class DataAuditor {
    private static final Javers JAVERS = JaversBuilder.javers().build();
    private static final Changes EMPTY_CHANGES = JAVERS.compare(new Snapshot(null), new Snapshot(null)).getChanges();

    private DataAuditor() { }

    public static Changes compare(Object before, Object after) {
        if (before == null && after == null) return EMPTY_CHANGES;
        if (before == null || after == null || simple(before) || simple(after)) {
            return JAVERS.compare(new Snapshot(before), new Snapshot(after)).getChanges();
        }
        return JAVERS.compare(before, after).getChanges();
    }

    private static boolean simple(Object value) {
        return value instanceof CharSequence || value instanceof Number || value instanceof Boolean
                || value instanceof Enum<?> || value instanceof java.util.Collection<?> || value instanceof java.util.Map<?, ?>
                || value.getClass().isArray();
    }

    private static final class Snapshot {
        private final Object value;
        private Snapshot(Object value) { this.value = value; }
    }
}
