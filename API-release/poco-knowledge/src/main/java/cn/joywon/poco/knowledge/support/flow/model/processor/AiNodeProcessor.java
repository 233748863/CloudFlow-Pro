package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;

/**
 * 节点处理器接口
 */
public interface AiNodeProcessor {
    /**
     * 执行节点
     *
     * @param node    节点
     * @param context 上下文
     * @return 执行结果
     */
    Dict execute(AiNodeDefinition node, FlowContextHolder context);
}
