package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.alibaba.csp.sentinel.util.StringUtil;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.support.constant.ModelProviderFormatEnums;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.flow.constants.NodeTypeConstants;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.core.FlowException;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import cn.joywon.poco.knowledge.support.flow.model.nodes.AiQuestionNode;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ResponseFormat;
import dev.langchain4j.model.chat.request.json.JsonIntegerSchema;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.model.chat.request.json.JsonSchema;
import dev.langchain4j.model.chat.response.ChatResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.tuple.Triple;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import static dev.langchain4j.data.message.SystemMessage.systemMessage;
import static dev.langchain4j.data.message.UserMessage.userMessage;
import static dev.langchain4j.model.chat.request.ResponseFormatType.JSON;

/**
 * 问题节点处理器
 *
 * @author poco
 * @date 2025/03/04
 */
@Slf4j
@Component(NodeTypeConstants.QUESTION)
@RequiredArgsConstructor
public class QuestionNodeProcessor extends AbstractNodeProcessor {

    private final ModelProvider modelProvider;

    @Override
    protected Dict doExecute(AiNodeDefinition node, FlowContextHolder context) {
        try {
            // 节点配置判断
            AiQuestionNode config = node.getQuestionParams();
            if (config == null) {
                throw FlowException.invalidParam("问答节点配置无效");
            }
            AiQuestionNode.Model modelConfig = config.getModelConfig();
            if (modelConfig == null) {
                throw FlowException.invalidParam("问答节点模型配置无效");
            }
            List<AiQuestionNode.Category> categories = config.getCategories();
            if (categories == null || categories.isEmpty()) {
                throw FlowException.invalidParam("问答节点选项无效");
            }

            // 获取输入参数
            Dict variables = getInputVariables(node, context);

            Triple<ChatLanguageModel, AiAssistantService, String> jsonTriple = modelProvider
                    .getAiJSONAssistant(modelConfig.getModel());

            ChatResponse chatResponse = jsonTriple.getLeft()
                    .chat(buildChatRequest(variables, categories, jsonTriple.getRight()));

            log.info("Flow Question JSON: {}", chatResponse.aiMessage().text());

            String result = JSONUtil.parseObj(chatResponse.aiMessage().text()).getStr(FlowConstant.QUESTION_VALUE);
            // 查找匹配的分支
            int caseIndex = getCaseIndex(config, result);

            // 设置结果
            return Dict.create().set(FlowConstant.INDEX, caseIndex)
                    .set(FlowConstant.TOKENS, chatResponse.tokenUsage().totalTokenCount())
                    .set(FlowConstant.TIMESTAMP, System.currentTimeMillis());

        } catch (Exception e) {
            throw FlowException.nodeError(node.getId(), "[问答节点] -> " + e.getMessage());
        }
    }

    private ChatRequest buildChatRequest(Dict input, List<AiQuestionNode.Category> categories, String jsonModel) {
        ChatRequest.Builder builder = ChatRequest.builder();
        JsonSchema jsonSchema = JsonSchema.builder()
                .name("ClassificationResult")
                .rootElement(JsonObjectSchema.builder().addProperties(new LinkedHashMap<>() {
                    {
                        JsonIntegerSchema valueJsonSchema = JsonIntegerSchema.builder().description("根据问题描述，最合适的分类结果值").build();
                        put(FlowConstant.QUESTION_VALUE, valueJsonSchema);
                    }
                }).required(FlowConstant.QUESTION_VALUE).additionalProperties(false).build())
                .build();

        // JSON Schema
        if (Objects.equals(jsonModel, ModelProviderFormatEnums.OPENAI.getFormat())) {
            builder.messages(systemMessage(PromptBuilder.render("flow-question-system-json.st")),
                            userMessage(PromptBuilder
                                    .render("flow-question-json.st",
                                            Map.of("input", input.toString(),
                                                    "categories", categories.stream().map(AiQuestionNode.Category::toString).
                                                            collect(Collectors.joining(StrUtil.LF)))
                                    )))
                    .responseFormat(ResponseFormat.builder().type(JSON).jsonSchema(jsonSchema).build()
                    );

        } else {
            builder.messages(systemMessage(PromptBuilder.render("flow-question-system-json.st")),
                    userMessage(PromptBuilder
                            .render("flow-question-json.st",
                                    Map.of("input", input.toString(),
                                            "categories", categories.stream().map(AiQuestionNode.Category::toString).
                                                    collect(Collectors.joining(StrUtil.LF)), "jsonSchema", jsonSchema)))
            );
        }

        return builder.build();
    }

    /**
     * 获取匹配的分支索引
     */
    private static int getCaseIndex(AiQuestionNode config, String result) {
        int caseIndex = -1;
        if (config.getCategories() != null && !config.getCategories().isEmpty()) {
            for (int i = 0; i < config.getCategories().size(); i++) {
                AiQuestionNode.Category caseItem = config.getCategories().get(i);
                String caseValue = caseItem.getName();
                if (StringUtil.equalsIgnoreCase(result, caseValue)) {
                    caseIndex = i;
                    break;
                }
            }
        }
        return caseIndex;
    }
}
