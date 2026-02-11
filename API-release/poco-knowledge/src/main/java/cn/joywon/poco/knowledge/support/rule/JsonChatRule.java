package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.ReflectUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.constant.ModelProviderFormatEnums;
import cn.joywon.poco.knowledge.support.function.FunctionCalling;
import cn.joywon.poco.knowledge.support.provider.ChatMemoryAdvisorProvider;
import cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.ChatMessageContextHolder;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import cn.joywon.poco.knowledge.support.util.ToolSpecificationsUtils;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ResponseFormat;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.model.chat.request.json.JsonSchema;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.tuple.Triple;
import org.jetbrains.annotations.Nullable;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.lang.reflect.Field;
import java.util.*;

import static cn.joywon.poco.knowledge.support.constant.AiPromptField.systemTime;
import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;
import static dev.langchain4j.data.message.SystemMessage.systemMessage;
import static dev.langchain4j.data.message.UserMessage.userMessage;
import static dev.langchain4j.model.chat.request.ResponseFormatType.JSON;
import static dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey;

/**
 * 基于JSON 结构化交互
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("jsonChat")
@RequiredArgsConstructor
public class JsonChatRule implements ChatRule {

    private final ChatMemoryAdvisorProvider chatMemoryAdvisorProvider;

    private final List<FunctionCalling> functionCallingList;

    private final ModelProvider modelProvider;

    /**
     * 基于向量自动匹配满足语义的， 智能选择
     *
     * @param chatMessageDTO 聊天消息 dto
     * @return {@link Flux }<{@link AiMessageResultDTO }>
     */
    @Nullable
    private static Flux<AiMessageResultDTO> autoChoice(ChatMessageDTO chatMessageDTO) {
        EmbeddingSearchResult<TextSegment> searchResult = MemoryEmbeddingProvider.search(chatMessageDTO.getContent()
                , 1, 0.6
                , metadataKey(EmbedBizTypeEnums.Fields.type).isEqualTo(EmbedBizTypeEnums.FUNCTION.getType()));

        if (searchResult.matches().isEmpty()) {
            return Flux.just(new AiMessageResultDTO("未找到相关功能，请点击下方+按钮选择目标功能"));
        }

        String functionName = searchResult.matches().get(0).embedded().metadata().getString(TEMP_ID);
        // 修改上下文中目标功能名称
        chatMessageDTO.getExtDetails().setFuncName(functionName);
        ChatMessageContextHolder.set(chatMessageDTO);
        return null;
    }

    /**
     * 构建聊天请求
     *
     * @param chatMemory
     * @param functionCalling 函数调用
     * @param inputText       输入文本
     * @param jsonModel       JSON 模型
     * @return {@link ChatRequest }
     */
    private ChatRequest buildChatRequest(ChatMemory chatMemory, FunctionCalling functionCalling, String inputText,
                                         String jsonModel) {
        ChatRequest.Builder builder = ChatRequest.builder();
        Class genericType = functionCalling.getGenericType();
        Field[] fields = ReflectUtil.getFields(genericType);
        JsonObjectSchema jsonObjectSchema = ToolSpecificationsUtils.parametersFrom(fields);
        JsonSchema jsonSchema = JsonSchema.builder()
                .name(functionCalling.functionName())
                .rootElement(jsonObjectSchema)
                .build();

        String metadata = PromptBuilder.render("knowledge-func-metadata.st", Map.of(BaseAiRequest.Fields.messageKey,
                ChatMessageContextHolder.get().getMessageKey(), systemTime, DateUtil.now()));

        // JSON Schema
        if (Objects.equals(jsonModel, ModelProviderFormatEnums.OPENAI.getFormat())) {
            chatMemory.add(userMessage(inputText + StrUtil.LF + metadata));
            List<ChatMessage> chatMessages = new ArrayList<>();
            chatMessages.add(systemMessage(PromptBuilder.render("ocr-system-json.st")));
            chatMessages.addAll(chatMemory.messages());
            builder.messages(chatMessages)
                    .responseFormat(ResponseFormat.builder().type(JSON).jsonSchema(jsonSchema).build());
        } else {
            chatMemory.add(userMessage(PromptBuilder.render("user-json.st", Map.of("userInput",
                    inputText + StrUtil.LF + metadata, "jsonSchema", jsonObjectSchema))));
            List<ChatMessage> chatMessages = new ArrayList<>();
            chatMessages.add(systemMessage(PromptBuilder.render("ocr-system-json.st")));
            chatMessages.addAll(chatMemory.messages());
            builder.messages(chatMessages);
        }

        return builder.build();
    }

    /**
     * 处理聊天信息
     *
     * @param chatMessageDTO 聊天上文
     * @return flux stream
     */
    @Override
    public Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {

        Triple<ChatLanguageModel, AiAssistantService, String> jsonAssistantTriple = modelProvider
                .getAiJSONAssistant(chatMessageDTO.getModelName());

        // 处理function，如果用户没有传递，则根据用户语义查询一个 function
        if (Objects.isNull(chatMessageDTO.getExtDetails()) || StrUtil.isBlank(chatMessageDTO.getExtDetails().getFuncName())) {
            Flux<AiMessageResultDTO> just = autoChoice(chatMessageDTO);
            if (just != null) return just;
        }


        // 判断是否包含函数名称
        Optional<FunctionCalling> functionCallingOptional = functionCallingList.stream()
                .filter(functionCalling -> StrUtil.equals(chatMessageDTO.getExtDetails().getFuncName(),
                        functionCalling.functionName()))
                .findFirst();

        if (functionCallingOptional.isEmpty()) {
            return Flux.just(new AiMessageResultDTO("调用失败，未找到对应的函数"));
        }

        FunctionCalling functionCalling = functionCallingOptional.get();
        ChatMemory chatMemory = chatMemoryAdvisorProvider.get(chatMessageDTO.getConversationId());
        ChatRequest chatRequest = buildChatRequest(chatMemory, functionCalling, chatMessageDTO.getContent(),
                jsonAssistantTriple.getRight());
        ChatResponse chatResponse = jsonAssistantTriple.getLeft().chat(chatRequest);
        log.info("json chatResponse: {}", chatResponse.aiMessage().text());

        // 大模型参数解析错误
        if (StrUtil.isBlank(chatResponse.aiMessage().text()) || !JSONUtil.isTypeJSON(chatResponse.aiMessage().text())) {
            return Flux.just(new AiMessageResultDTO("大模型参数解析错误:" + chatResponse.aiMessage().text()));
        }

        // 使用参数调用原有的函数逻辑
        ToolExecutionRequest toolExecutionRequest = ToolExecutionRequest.builder()
                .name(functionCalling.functionName())
                .arguments(chatResponse.aiMessage().text())
                .id(chatMessageDTO.getConversationId())
                .build();

        R<String> resultR = functionCalling.execute(toolExecutionRequest);
        String result = StrUtil.isBlank(resultR.getData()) ? resultR.getMsg() : resultR.getData();
        chatMemory.add(AiMessage.from(chatResponse.aiMessage().text() + StrUtil.LF + result));

        // 返回结果 ,如果业务处理成功的话，增加跳转路由标识
        return Flux.just(new AiMessageResultDTO(result, resultR.isOk() ? functionCalling.routePath() : null));
    }
}
