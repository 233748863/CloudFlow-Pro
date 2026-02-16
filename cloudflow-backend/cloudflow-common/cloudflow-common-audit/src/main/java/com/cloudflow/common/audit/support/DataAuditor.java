package com.cloudflow.common.audit.support;

import org.javers.core.Changes;
import org.javers.core.Javers;
import org.javers.core.JaversBuilder;

import java.util.Collections;

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
     * 空占位对象，仅用于 JaVers 空比较。
     * JaVers 不支持比较 Object / Long / String 等顶层简单类型，
     * 所以需要一个自定义 POJO 来生成空 Changes。
     */
    private static class EmptyHolder {}

    /** 缓存的空 Changes，避免重复创建 */
    private static final Changes EMPTY_CHANGES =
            JAVERS.compare(new EmptyHolder(), new EmptyHolder()).getChanges();

    /**
     * 比较两个对象的差异
     *
     * @param oldVal 旧值对象
     * @param newVal 新值对象
     * @return 变更列表（包含字段名、旧值、新值）
     */
    public static Changes compare(Object oldVal, Object newVal) {
        if (oldVal == null && newVal == null) {
            return EMPTY_CHANGES;
        }
        if (oldVal == null) {
            // 新增场景：无旧值可比较，返回空
            return EMPTY_CHANGES;
        }
        if (newVal == null) {
            // 删除场景：无新值可比较，返回空
            return EMPTY_CHANGES;
        }

        // JaVers 不支持比较 Long/String/Integer/List 等非复杂对象类型，
        // 遇到这类值直接跳过比较，返回空 Changes
        if (isUnsupportedType(oldVal) || isUnsupportedType(newVal)) {
            return EMPTY_CHANGES;
        }

        try {
            return JAVERS.compare(oldVal, newVal).getChanges();
        } catch (Exception e) {
            // 兜底：如果 JaVers 比较过程中出现任何异常，返回空 Changes 而非抛出异常
            return EMPTY_CHANGES;
        }
    }

    /**
     * 判断对象是否为 JaVers 不支持作为顶层比较的类型
     * （原始类型包装类、String、枚举、集合等）
     */
    private static boolean isUnsupportedType(Object obj) {
        if (obj == null) {
            return false;
        }
        Class<?> clazz = obj.getClass();
        // java.lang 包下的类型（Long, Integer, String, Boolean 等）
        if (clazz.getName().startsWith("java.lang")) {
            return true;
        }
        // java.util 包下的集合类型（List, Map, Set 等）
        if (clazz.getName().startsWith("java.util")) {
            return true;
        }
        // java.math 包下的类型（BigDecimal, BigInteger）
        if (clazz.getName().startsWith("java.math")) {
            return true;
        }
        // 枚举类型
        if (clazz.isEnum()) {
            return true;
        }
        // 数组类型
        if (clazz.isArray()) {
            return true;
        }
        return false;
    }
}
