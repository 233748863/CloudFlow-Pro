package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

/**
 * 全文搜索属性
 *
 * @author poco
 * @date 2025/02/27
 */
@Data
public class FullTextSearchProperties {

    /**
     * 启用
     */
    private boolean enabled = true;

    /**
     * 托普克
     */
    private int topK = 1;

    /**
     * 算法：允许在搜索过程中对查询向量中的小值进行微调
     */
    private String algorithm = "drop_ratio_search";

    /**
     * Drop Ratio
     */
    private float dropRatio = 0.2F;
}
