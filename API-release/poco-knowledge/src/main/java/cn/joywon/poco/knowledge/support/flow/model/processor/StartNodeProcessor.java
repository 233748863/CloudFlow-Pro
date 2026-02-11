package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.flow.constants.NodeTypeConstants;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 开始节点处理器
 */
@Component(NodeTypeConstants.START)
@RequiredArgsConstructor
public class StartNodeProcessor extends AbstractNodeProcessor {

    @Override
    protected Dict doExecute(AiNodeDefinition node, FlowContextHolder context) {
        // 获取上下文对应的节点参数
        Map<String, Object> params = context.getParameters();
        // 开始节点只需要传递输入参数
        return Dict.create().set(FlowConstant.RESULT, params)
                .set(FlowConstant.TIMESTAMP, System.currentTimeMillis());
    }
}
