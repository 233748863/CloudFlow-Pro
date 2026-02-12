package com.cloudflow.common.datascope;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 数据权限SQL函数类型枚举
 * 用于指定查询类型(SELECT * 或 COUNT)
 * 
 * @author CloudFlow
 * @date 2026-02-12
 */
@Getter
@AllArgsConstructor
public enum DataScopeFuncEnum {

    /**
     * 查询所有列 - SELECT *
     */
    ALL("*"),

    /**
     * 统计查询 - COUNT(1)
     */
    COUNT("COUNT(1)");

    /**
     * SQL函数类型
     */
    private final String type;
}
