package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.joywon.poco.knowledge.dto.AiFlowExecuteDTO;
import cn.joywon.poco.knowledge.entity.AiFlowEntity;
import cn.joywon.poco.knowledge.support.flow.model.AiFlowDSLDefinition;
import cn.joywon.poco.knowledge.support.flow.model.AiFlowExecuteResult;

/**
 * @author poco
 * @date 2025/3/3
 */
public interface AiFlowProcessor {

    /**
     * 执行工作流
     *
     * @param flow           工作流定义
     * @param dsl            工作流dsl
     * @param flowExecuteDTO 请求参数
     * @return 执行结果
     */
    AiFlowExecuteResult execute(AiFlowEntity flow, AiFlowDSLDefinition dsl, AiFlowExecuteDTO flowExecuteDTO);
}
