package cn.joywon.poco.knowledge.support.flow.model;

import cn.joywon.poco.knowledge.support.flow.model.nodes.*;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * AI 节点定义
 *
 * @author poco
 * @date 2025/03/03
 */
@Data
public class AiNodeDefinition {

    /**
     * 节点ID
     */
    private String id;

    /**
     * 节点类型
     */
    private String type;

    /**
     * 节点名称
     */
    private String name;

    /**
     * 节点描述
     */
    private String description;

    /**
     * 节点状态
     */
    private String status;

    /**
     * 节点执行时长(ms)
     */
    private Long duration;

    /**
     * Token使用量
     */
    private Integer tokens;

    /**
     * 错误信息
     */
    private String error;

    /**
     * 输出结果
     */
    private Map<String, Object> output;

    /**
     * 分支索引
     */
    private Integer branchIndex;

    /**
     * 输入参数配置
     */
    private List<AiParamDefinition> inputParams;

    /**
     * 输出参数配置
     */
    private List<AiParamDefinition> outputParams;


    /**
     * http节点参数配置
     */
    private AiHttpNode httpParams;

    /**
     * DB节点参数配置
     */
    private AiDbNode dbParams;

    /**
     * rag 参数
     */
    private AiRagNode ragParams;

    /**
     * 分支节点参数配置
     */
    private AiSwitchNode switchParams;

    /**
     * 代码节点参数配置
     */
    private AiCodeNode codeParams;

    /**
     * 大模型节点参数配置
     */
    private AiLLMNode llmParams;

    /**
     * 问答节点参数配置
     */
    private AiQuestionNode questionParams;

    /**
     * 消息节点参数配置
     */
    private AiNoticeNode noticeParams;
}
