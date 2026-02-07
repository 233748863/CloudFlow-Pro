package com.cloudflow.common.core.domain;

import lombok.Data;
import java.util.List;

@Data
public class PageResult<T> {
    private List<T> rows;
    private long total;
    private long pageNum;
    private long pageSize;

    public PageResult(List<T> rows, long total, long pageNum, long pageSize) {
        this.rows = rows;
        this.total = total;
        this.pageNum = pageNum;
        this.pageSize = pageSize;
    }
}
