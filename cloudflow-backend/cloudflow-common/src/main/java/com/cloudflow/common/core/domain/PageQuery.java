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
     */
    public <T> Page<T> build() {
        return new Page<>(pageNum, pageSize);
    }
}
