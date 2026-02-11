package cn.joywon.poco.knowledge.support.flow.model;

import lombok.Data;

/**
 * AI 连接定义
 *
 * @author poco
 * @date 2025/03/03
 */
@Data
public class AiFlowConnectionDefinition {

    /**
     * 源节点ID
     */
    private String sourceId;

    /**
     * 目标节点ID
     */
    private String targetId;

    /**
     * 顺序
     */
    private Integer portIndex;
}
