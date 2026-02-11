package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.template.Template;
import cn.hutool.extra.template.TemplateConfig;
import cn.hutool.extra.template.TemplateEngine;
import cn.hutool.extra.template.TemplateUtil;
import cn.joywon.poco.common.core.util.WebUtils;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.flow.constants.NodeTypeConstants;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.core.FlowException;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import cn.joywon.poco.knowledge.support.flow.model.nodes.AiRagNode;
import cn.joywon.poco.knowledge.support.rule.VectorChatRule;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/**
 * 知识库库节点执行器
 */
@Component(NodeTypeConstants.RAG)
@RequiredArgsConstructor
public class RagNodeExecutor extends AbstractNodeProcessor {
    public static final TemplateEngine engine = TemplateUtil.createEngine(new TemplateConfig());

    private final VectorChatRule vectorChat;

    @Override
    protected Dict doExecute(AiNodeDefinition node, FlowContextHolder context) {

        // 节点配置判断
        AiRagNode ragParams = node.getRagParams();
        if (ragParams == null || ragParams.getPrompt() == null) {
            throw FlowException.invalidParam("知识库节点配置无效");
        }
        // 获取输入参数
        Dict variables = getInputVariables(node, context);

        Template template = engine.getTemplate(ragParams.getPrompt());
        String prompt = template.render(variables);

        ChatMessageDTO chatMessageDTO = new ChatMessageDTO();
        chatMessageDTO.setDatasetId(ragParams.getDatasetId());
        chatMessageDTO.setContent(prompt);
        chatMessageDTO.setConversationId(context.getFlowId() + WebUtils.getToken());
        Mono<String> resultMono = vectorChat.process(chatMessageDTO)
                .reduce(StrUtil.EMPTY, (acc, value) -> acc + value.getMessage());
        return Dict.create().set(FlowConstant.RESULT, resultMono.block())
                .set(FlowConstant.TIMESTAMP, System.currentTimeMillis());
    }
}
