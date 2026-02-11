package cn.joywon.poco.knowledge.support.flow.model;

import cn.hutool.core.lang.Dict;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * @author poco
 * @date 2025/3/3
 */
@Data
public class AiFlowDSLDefinition {
    /**
     * 节点列表
     */
    private List<AiNodeDefinition> nodes;

    /**
     * 连接列表
     */
    private List<AiFlowConnectionDefinition> connections;

    /**
     * 执行参数
     */
    @Schema(description = "执行参数")
    private List<Dict> params;
}
