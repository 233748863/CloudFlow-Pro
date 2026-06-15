package com.cloudflow.common.core.domain;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.Data;
import java.util.HashMap;
import java.util.Map;

@Data
public class PageQuery {
    private Integer pageNum = 1;
    private Integer pageSize = 10;
    /** 扩展查询参数 */
    private Map<String, Object> params = new HashMap<>();

    /**
     * 构建 MyBatis-Plus 分页对象
     * 增加大页保护，最大允许单页 100 条记录
     */
    public <T> Page<T> build() {
        int size = (pageSize == null || pageSize <= 0) ? 10 : pageSize;
        if (size > 100) {
            size = 100;
        }
        return new Page<>(pageNum, size);
    }
}
