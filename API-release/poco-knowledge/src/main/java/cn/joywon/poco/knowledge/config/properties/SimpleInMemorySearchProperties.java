package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

/**
 * 简单内存搜索属性
 *
 * @author poco
 * @date 2025/03/21
 */
@Data
public class SimpleInMemorySearchProperties {

    /**
     * 获取几条
     */
    private int topK = 1;

    /**
     * 最低分数
     */
    private double minScore = 0.7;


    /**
     * 最大段大小 （chars）
     */
    private int maxSegmentSizeInChars = 500;

    /**
     * 最大重叠大小 （以字符为单位）
     */
    private int maxOverlapSizeInChars = 50;
}
