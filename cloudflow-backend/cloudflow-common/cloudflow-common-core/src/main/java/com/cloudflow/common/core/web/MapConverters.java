package com.cloudflow.common.core.web;

import com.cloudflow.common.core.domain.PageResult;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Controller 层 DTO ↔ Map ↔ VO / PageResult 转换工具。
 *
 * <p>用于 B1 阶段：Controller 入参 DTO 经此适配为 Map 喂给历史 Service 签名，
 * Service 输出 Map 再经此包装为 VO / PageResult。B3 阶段 Service 签名改造完成后
 * 部分调用点可删除。
 *
 * <p>注：方法均无状态、可线程安全调用。{@link ObjectMapper} 由调用方注入（Spring 标准 bean）。
 */
public final class MapConverters {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private MapConverters() {
    }

    /**
     * DTO / POJO → Map&lt;String,Object&gt;。null 入参返回新建空 Map。
     */
    public static Map<String, Object> toMap(Object dto, ObjectMapper objectMapper) {
        if (dto == null) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(dto, MAP_TYPE);
    }

    /**
     * Query DTO → 服务层 Map。
     *
     * <p>剔除 {@code params} 字段（PageQuery 内部 Map，避免 Map 嵌套 Map 引起 SQL where 拼接异常）。
     */
    public static Map<String, Object> toServiceQuery(Object query, ObjectMapper objectMapper) {
        Map<String, Object> map = toMap(query, objectMapper);
        map.remove("params");
        return map;
    }

    /**
     * 将服务层返回的 {@code Map{rows|list, total, pageNum, pageSize}} 形状 Map
     * 转换为强类型 {@link PageResult}。{@code rows} / {@code list} 任一存在即可。
     *
     * @param raw     服务层返回的扁平 Map
     * @param voType  目标 VO 类型
     * @param mapper  Jackson ObjectMapper
     * @param <V>     VO 类型参数
     */
    public static <V> PageResult<V> toPageResult(Map<String, Object> raw, Class<V> voType, ObjectMapper mapper) {
        PageResult<V> result = new PageResult<>();
        if (raw == null) {
            result.setRows(Collections.emptyList());
            result.setTotal(0L);
            return result;
        }
        Object rowsObj = raw.get("rows");
        if (rowsObj == null) {
            rowsObj = raw.get("list");
        }
        List<V> rows = new ArrayList<>();
        if (rowsObj instanceof List<?> list) {
            for (Object row : list) {
                if (row instanceof Map<?, ?> m) {
                    rows.add(mapper.convertValue(m, voType));
                } else if (row != null) {
                    rows.add(mapper.convertValue(row, voType));
                }
            }
        }
        result.setRows(rows);
        Object total = raw.get("total");
        result.setTotal(total instanceof Number n ? n.longValue() : 0L);
        Object pageNum = raw.get("pageNum");
        Object pageSize = raw.get("pageSize");
        result.setPageNum(pageNum instanceof Number n ? n.longValue() : 1L);
        result.setPageSize(pageSize instanceof Number n ? n.longValue() : (long) rows.size());
        return result;
    }

    /**
     * 从服务层返回的 {@code Map{rows|list, total}} 中提取行列表。
     *
     * <p>用于"不分页的列表"接口：Service 仍以 Map 包装 {@code rows/list} 形态返回，
     * Controller 只需展开为 {@code List<?>}（元素可能是 Map 或 Entity）再喂给 {@link #toVOList}。
     */
    public static List<?> extractRows(Map<String, Object> raw) {
        if (raw == null) {
            return Collections.emptyList();
        }
        Object rows = raw.get("rows");
        if (rows == null) {
            rows = raw.get("list");
        }
        return rows instanceof List<?> list ? list : Collections.emptyList();
    }

    /**
     * Map → 强类型 VO。Map 为 null 返回 null。
     */
    public static <V> V toVO(Map<String, Object> raw, Class<V> voType, ObjectMapper mapper) {
        if (raw == null) {
            return null;
        }
        return mapper.convertValue(raw, voType);
    }

    /**
     * 行列表 → VO 列表。行可能是 Map 或 Entity，Jackson convertValue 通吃。null 入参返回空列表。
     */
    public static <V> List<V> toVOList(List<?> rows, Class<V> voType, ObjectMapper mapper) {
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }
        List<V> result = new ArrayList<>(rows.size());
        for (Object row : rows) {
            if (row != null) {
                result.add(mapper.convertValue(row, voType));
            }
        }
        return result;
    }
}
