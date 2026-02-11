package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.hutool.core.lang.Pair;
import cn.hutool.extra.template.TemplateConfig;
import cn.hutool.extra.template.TemplateEngine;
import cn.hutool.extra.template.TemplateUtil;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.flow.constants.NodeTypeConstants;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.core.FlowException;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import cn.joywon.poco.knowledge.support.flow.model.nodes.AiLLMNode;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.data.message.*;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * LLM节点处理器
 */
@Component(NodeTypeConstants.LLM)
@RequiredArgsConstructor
public class LLMNodeProcessor extends AbstractNodeProcessor {
    public static final TemplateEngine engine = TemplateUtil.createEngine(new TemplateConfig());

    private final ModelProvider modelProvider;

    @Override
    protected Dict doExecute(AiNodeDefinition node, FlowContextHolder context) {
        try {
            // 节点配置判断
            AiLLMNode config = node.getLlmParams();
            if (config == null) {
                throw FlowException.invalidParam("LLM节点配置无效");
            }
            AiLLMNode.Model modelConfig = config.getModelConfig();
            if (modelConfig == null) {
                throw FlowException.invalidParam("LLM节点模型配置无效");
            }
            List<AiLLMNode.Message> messages = config.getMessages();
            if (messages == null || messages.isEmpty()) {
                throw FlowException.invalidParam("LLM节点消息配置无效");
            }

            // 获取输入参数
            Dict variables = getInputVariables(node, context);

            // 处理消息中的变量替换
            List<ChatMessage> chatMessages = messages.stream().map(msg -> {
                        String render = engine.getTemplate(msg.getContent()).render(variables);
                        if (msg.getRole().equals(ChatMessageType.AI.name())) {
                            return AiMessage.aiMessage(render);
                        }
                        if (msg.getRole().equals(ChatMessageType.USER.name())) {
                            return UserMessage.from(render);
                        }
                        return SystemMessage.systemMessage(render);
                    }
            ).toList();

            Pair<ChatLanguageModel, AiAssistantService> servicePair = modelProvider.getAiAssistant(modelConfig.getModel());

            ChatResponse chatResponse = servicePair.getKey().chat(ChatRequest.builder()
                    .messages(chatMessages)
                    .build());

            // 获取返回结果
            Integer totalTokens = chatResponse.tokenUsage().totalTokenCount();
            String content = chatResponse.aiMessage().text();
            String role = chatResponse.aiMessage().type().name();

            // 设置结果
            return Dict.create().set(FlowConstant.CONTENT, content)
                    .set(FlowConstant.ROLE, role)
                    .set(FlowConstant.TOKENS, totalTokens)
                    .set(FlowConstant.TIMESTAMP, System.currentTimeMillis());

        } catch (Exception e) {
            throw FlowException.nodeError(node.getId(), "[LLM节点] -> " + e.getMessage());
        }
    }
}
