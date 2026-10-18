package com.cloudflow.common.core.search;

import java.util.List;

public record BusinessSearchResponse(String keyword, int limitPerType, List<BusinessSearchGroup> groups) {
    public BusinessSearchResponse {
        groups = List.copyOf(groups);
    }
}
