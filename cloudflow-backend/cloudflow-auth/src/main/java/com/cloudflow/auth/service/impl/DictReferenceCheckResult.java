package com.cloudflow.auth.service.impl;

public record DictReferenceCheckResult(
        String dictType,
        String dictValue,
        String tableName,
        String columnName,
        String label,
        long refCount
) {
    public String summary() {
        return label + "=" + refCount;
    }
}
