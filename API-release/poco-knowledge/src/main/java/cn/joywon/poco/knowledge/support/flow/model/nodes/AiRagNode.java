package cn.joywon.poco.knowledge.support.flow.model.nodes;

import lombok.Data;

/**
 * 知识库节点
 */
@Data
public class AiRagNode {
    /**
     * 数据id
     */
    private Long datasetId;

    /**
     * 数据集名称
     */
    private String datasetName;

    /**
     * 提示
     */
    private String prompt;
}
