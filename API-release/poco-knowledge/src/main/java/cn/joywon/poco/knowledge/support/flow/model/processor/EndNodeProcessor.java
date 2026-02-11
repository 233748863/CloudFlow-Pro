package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.flow.constants.NodeTypeConstants;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import org.springframework.stereotype.Component;

/**
 * 结束节点处理器
 */
@Component(NodeTypeConstants.END)
public class EndNodeProcessor extends AbstractNodeProcessor {

    @Override
    protected Dict doExecute(AiNodeDefinition node, FlowContextHolder context) {
        try {
            // 获取最终输入参数
            Dict variables = getInputVariables(node, context);
            context.setVariable(FlowConstant.RESULT, variables);
            return Dict.create().set(FlowConstant.RESULT, variables)
                    .set(FlowConstant.TIMESTAMP, System.currentTimeMillis());
        } catch (Exception e) {
            throw new RuntimeException("[结束节点] -> " + e.getMessage(), e);
        }
    }
}
