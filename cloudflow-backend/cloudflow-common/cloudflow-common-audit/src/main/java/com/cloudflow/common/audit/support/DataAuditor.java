package com.cloudflow.common.audit.support;

import org.javers.core.Changes;
import org.javers.core.Javers;
import org.javers.core.JaversBuilder;

/**
 * Javers 数据审计工具
 * <p>
 * 封装 Javers 对象差异比较功能，
 * 比较两个对象之间的字段级变更。
 * </p>
 *
 * @author CloudFlow
 */
public class DataAuditor {

    private static final Javers JAVERS = JaversBuilder.javers().build();

    /**
     * 比较两个对象的差异
     *
     * @param oldVal 旧值对象
     * @param newVal 新值对象
     * @return 变更列表（包含字段名、旧值、新值）
     */
    public static Changes compare(Object oldVal, Object newVal) {
        if (oldVal == null && newVal == null) {
            // 两者都为空，返回无变更的空 Diff
            return JAVERS.compare(new Object(), new Object()).getChanges();
        }
        if (oldVal == null) {
            // 新增场景：用空对象与新值比较
            return JAVERS.compare(newVal, newVal).getChanges();
        }
        if (newVal == null) {
            // 删除场景：用旧值与空对象比较
            return JAVERS.compare(oldVal, oldVal).getChanges();
        }
        return JAVERS.compare(oldVal, newVal).getChanges();
    }
}
