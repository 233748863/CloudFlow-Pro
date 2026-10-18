package com.cloudflow.common.core.search;

public record BusinessSearchHit(BusinessSearchType type, String id, String title, String number, String status, String route) {
    public BusinessSearchHit {
        if (type == null || !type.route(id).equals(route)) throw new IllegalArgumentException("搜索结果路径无效");
        if (title == null || title.isBlank()) title = number == null || number.isBlank() ? "未命名记录" : number;
    }

    public static BusinessSearchHit from(BusinessSearchType type, BusinessSearchRow row) {
        return new BusinessSearchHit(type, row.getId(), row.getTitle(), row.getNumber(), row.getStatus(), type.route(row.getId()));
    }
}
