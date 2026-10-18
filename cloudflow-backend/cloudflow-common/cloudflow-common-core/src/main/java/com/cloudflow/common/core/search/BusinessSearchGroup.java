package com.cloudflow.common.core.search;

import java.util.List;

public record BusinessSearchGroup(BusinessSearchType type, State state, List<BusinessSearchHit> items, boolean hasMore) {
    public enum State { AVAILABLE, FORBIDDEN, UNAVAILABLE }

    public BusinessSearchGroup {
        if (type == null || state == null || items == null || items.size() > 10
                || items.stream().anyMatch(item -> item == null || item.type() != type)
                || state != State.AVAILABLE && (!items.isEmpty() || hasMore)) {
            throw new IllegalArgumentException("搜索分组结果无效");
        }
        items = List.copyOf(items);
    }

    public static BusinessSearchGroup available(BusinessSearchType type, List<BusinessSearchRow> rows, int limit) {
        if (limit < 1 || limit > 10 || rows == null || rows.size() > limit + 1) throw new IllegalArgumentException("搜索结果条数无效");
        return new BusinessSearchGroup(type, State.AVAILABLE,
                rows.stream().limit(limit).map(row -> BusinessSearchHit.from(type, row)).toList(), rows.size() > limit);
    }

    public static BusinessSearchGroup unavailable(BusinessSearchType type) {
        return new BusinessSearchGroup(type, State.UNAVAILABLE, List.of(), false);
    }

    public static BusinessSearchGroup forbidden(BusinessSearchType type) {
        return new BusinessSearchGroup(type, State.FORBIDDEN, List.of(), false);
    }
}
