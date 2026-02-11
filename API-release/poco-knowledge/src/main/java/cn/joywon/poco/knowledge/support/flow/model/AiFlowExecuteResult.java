package cn.joywon.poco.knowledge.support.flow.model;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * @author poco
 * @date 2025/3/3
 */
@Data
public class AiFlowExecuteResult {


    /**
     * 执行的节点列表
     */
    @Schema(description = "执行的节点列表")
    private List<AiNodeDefinition> nodes;

    /**
     * 执行参数
     */
    @Schema(description = "执行参数")
    private Map<String, Object> variables;

    /**
     * 执行结果
     */
    @Schema(description = "执行结果")
    private Object result;

    /**
     * 执行状态
     */
    @Schema(description = "执行状态")
    private String executed;

    /**
     * 错误信息
     */
    @Schema(description = "错误信息")
    private String error;

    /**
     * 执行时长(ms)
     */
    @Schema(description = "执行时长(ms)")
    private Long duration;

    /**
     * Token总使用量
     */
    @Schema(description = "Token总使用量")
    private Long totalTokens;

    @Override
    public String toString() {
        return "FlowExecuteResult{" +
                "nodes=" + nodes +
                ", variables=" + variables +
                ", result=" + result +
                ", executed=" + executed +
                ", error=" + error +
                ", duration=" + duration +
                ", totalTokens=" + totalTokens +
                '}';
    }
}
