package cn.joywon.poco.knowledge.support.flow.model.nodes;

import lombok.Data;

/**
 * 数据库节点配置
 */
@Data
public class AiDbNode {
    /**
     * 数据库ID
     */
    private String dbId;

    /**
     * SQL语句
     */
    private String sql;
}
