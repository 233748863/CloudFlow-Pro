package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.ReflectUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.mapper.AiChatRecordMapper;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.service.AiDataService;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.constant.ModelProviderFormatEnums;
import cn.joywon.poco.knowledge.support.feign.RemoteTableInfoService;
import cn.joywon.poco.knowledge.support.function.Chat2SqlFunctionCalling;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static cn.joywon.poco.knowledge.support.constant.AiPromptField.systemTime;
import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;
import static dev.langchain4j.data.message.SystemMessage.systemMessage;
import static dev.langchain4j.data.message.UserMessage.userMessage;
import static dev.langchain4j.model.chat.request.ResponseFormatType.JSON;
import static dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey;

/**
 * 基于数据库的聊天
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("databaseChat")
@RequiredArgsConstructor
public class DatabaseChatRule implements ChatRule {

    private final Chat2SqlFunctionCalling chat2SqlFunctionCalling;

    private final ChatMemoryAdvisorProvider chatMemoryAdvisorProvider;

    private final RemoteTableInfoService tableInfoService;

    private final AiChatRecordMapper chatRecordMapper;

    private final AiDataService aiDataService;

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
                , metadataKey(EmbedBizTypeEnums.Fields.type).isEqualTo(EmbedBizTypeEnums.CHAT2SQL.getType()));

        if (searchResult.matches().isEmpty()) {
            return Flux.just(new AiMessageResultDTO("未找到相关数据集建模，请点击下方+按钮选择目标数据集合"));
        }

        Long dataId = searchResult.matches().get(0).embedded().metadata().getLong(TEMP_ID);
        // 修改上下文中目标功能名称
        chatMessageDTO.getExtDetails().setDataId(dataId);
        ChatMessageContextHolder.set(chatMessageDTO);
        return null;
    }

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

        // 处理mcp，如果用户没有传递，则根据用户语义查询一个 data 数据集
        if (Objects.isNull(chatMessageDTO.getExtDetails())
                || Objects.isNull(chatMessageDTO.getExtDetails().getDataId())) {
            Flux<AiMessageResultDTO> just = autoChoice(chatMessageDTO);
            if (just != null) return just;
        }

        Long dataId = chatMessageDTO.getExtDetails().getDataId();
        String tableSchemas = aiDataService.queryDataSchema(dataId);
        chatMessageDTO.getExtDetails().setDataId(dataId);
        chatMessageDTO.getExtDetails().setFuncName(chat2SqlFunctionCalling.functionName());
        ChatMessageContextHolder.set(chatMessageDTO);

        // 更新record 记录
        AiChatRecordEntity recordEntity = new AiChatRecordEntity();
        recordEntity.setRecordId(chatMessageDTO.getMessageKey());
        recordEntity.setExtDetails(JSONUtil.toJsonStr(chatMessageDTO.getExtDetails()));
        chatRecordMapper.updateById(recordEntity);

        Triple<ChatLanguageModel, AiAssistantService, String> jsonAssistantTriple = modelProvider
                .getAiJSONAssistant(chatMessageDTO.getModelName());

        ChatMemory chatMemory = chatMemoryAdvisorProvider.get(chatMessageDTO.getConversationId());

        String render = PromptBuilder.render("chat2db.st",
                Map.of("tableSchema", tableSchemas, "userInput", chatMessageDTO.getContent(),
                        "tenantId", Objects.nonNull(TenantContextHolder.getTenantId())
                                ? TenantContextHolder.getTenantId() : StrUtil.EMPTY,
                        systemTime, DateUtil.now())
        );

        ChatRequest chatRequest = buildChatRequest(chatMemory, chat2SqlFunctionCalling, render,
                jsonAssistantTriple.getRight());
        ChatResponse chatResponse = jsonAssistantTriple.getLeft().chat(chatRequest);
        log.info("json chatResponse: {}", chatResponse.aiMessage().text());


        // 使用参数调用原有的函数逻辑
        ToolExecutionRequest toolExecutionRequest = ToolExecutionRequest.builder()
                .name(chat2SqlFunctionCalling.functionName())
                .arguments(chatResponse.aiMessage().text())
                .id(chatMessageDTO.getConversationId())
                .build();

        R<String> resultR = chat2SqlFunctionCalling.execute(toolExecutionRequest);
        String result = StrUtil.isBlank(resultR.getData()) ? resultR.getMsg() : resultR.getData();
        chatMemory.add(AiMessage.from(chatResponse.aiMessage().text() + StrUtil.LF + result));

        ChatMessageDTO resultChatMessageDTO = ChatMessageContextHolder.get();


        AiMessageResultDTO aiMessageResultDTO = new AiMessageResultDTO(result);
        if (Objects.nonNull(resultChatMessageDTO) && Objects.nonNull(resultChatMessageDTO.getExtDetails())
                && Objects.nonNull(resultChatMessageDTO.getExtDetails().getChartType())) {
            aiMessageResultDTO.setChartType(resultChatMessageDTO.getExtDetails().getChartType());
            aiMessageResultDTO.setChartId(resultChatMessageDTO.getExtDetails().getChartId());
        }
        return Flux.just(aiMessageResultDTO);
    }

}
