package cn.joywon.poco.knowledge.support.handler.model;

import cn.hutool.core.lang.Pair;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.service.*;
import cn.joywon.poco.knowledge.support.constant.ModelProviderFormatEnums;
import cn.joywon.poco.knowledge.support.provider.ChatMemoryAdvisorProvider;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.model.chat.listener.ChatModelListener;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import dev.langchain4j.model.image.ImageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.tool.ToolProvider;
import lombok.RequiredArgsConstructor;
import org.apache.commons.lang3.tuple.Triple;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.support.RestClientAdapter;
import org.springframework.web.service.invoker.HttpServiceProxyFactory;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

/**
 * 支持 OpenAI 协议的模型处理器
 *
 * @author poco
 * @date 2024/09/29
 */
@Service
@RequiredArgsConstructor
public class OpenAIModelHandler extends AbstractModelBuildHandler {

    private final ChatMemoryAdvisorProvider chatMemoryAdvisorProvider;

    private final AiKnowledgeProperties aiKnowledgeProperties;

    private final Optional<RestClient.Builder> restClientBuilderOptional;

    private final List<ChatModelListener> chatModelListenerList;

    private final ToolProvider toolProvider;

    /**
     * 是否支持模型类型
     *
     * @param aiModel 模型
     * @return {@link Object}
     */
    @Override
    public boolean support(AiModelEntity aiModel) {
        return true;
    }

    /**
     * 构建 Chat Assistant (同步调用)
     *
     * @param aiModel AI 模型
     * @return {@link AiAssistantService }
     */
    @Override
    public Pair<ChatLanguageModel, AiAssistantService> buildAiAssistant(AiModelEntity aiModel) {
        OpenAiChatModel chatModel = OpenAiChatModel.builder()//
                .apiKey(aiModel.getApiKey())//
                .baseUrl(aiModel.getBaseUrl())//
                .modelName(aiModel.getModelName())//
                .temperature(aiModel.getTemperature())//
                .topP(aiModel.getTopP())//
                .maxCompletionTokens(aiModel.getResponseLimit())//
                .listeners(chatModelListenerList)//
                .timeout(Duration.ofSeconds(aiKnowledgeProperties.getConnectTimeout()))
                .logRequests(aiKnowledgeProperties.isShowLog())//
                .logResponses(aiKnowledgeProperties.isShowLog())//
                .maxRetries(aiKnowledgeProperties.getMaxRetry())//
                .build();

        return Pair.of(chatModel,
                AiServices.builder(AiAssistantService.class)
                        .chatLanguageModel(chatModel)
                        .chatMemoryProvider(chatMemoryAdvisorProvider)
                        .build());
    }

    /**
     * 构建 AI Stream Assistant
     *
     * @param aiModel AI 模型
     * @return {@link AiStreamAssistantService }
     */
    @Override
    public Pair<StreamingChatLanguageModel, AiStreamAssistantService> buildAiStreamAssistant(AiModelEntity aiModel) {
        OpenAiStreamingChatModel streamingChatLanguageModel = OpenAiStreamingChatModel.builder()//
                .apiKey(aiModel.getApiKey())//
                .baseUrl(aiModel.getBaseUrl())//
                .modelName(aiModel.getModelName())//
                .temperature(aiModel.getTemperature())//
                .topP(aiModel.getTopP())//
                .maxCompletionTokens(aiModel.getResponseLimit())//
                .listeners(chatModelListenerList)//
                .timeout(Duration.ofSeconds(aiKnowledgeProperties.getConnectTimeout()))
                .logRequests(aiKnowledgeProperties.isShowLog())//
                .logResponses(aiKnowledgeProperties.isShowLog())//
                .build();

        return Pair.of(streamingChatLanguageModel,
                AiServices.builder(AiStreamAssistantService.class)
                        .streamingChatLanguageModel(streamingChatLanguageModel)
                        .chatMemoryProvider(chatMemoryAdvisorProvider)
                        .build());
    }

    /**
     * 构建 AI Stream Assistant
     *
     * @param aiModel AI 模型
     * @return {@link AiStreamAssistantService }
     */
    @Override
    public Pair<StreamingChatLanguageModel, AiNoMemoryStreamAssistantService> buildAiNoMemoryStreamAssistant(AiModelEntity aiModel) {
        OpenAiStreamingChatModel streamingChatLanguageModel = OpenAiStreamingChatModel.builder()//
                .apiKey(aiModel.getApiKey())//
                .baseUrl(aiModel.getBaseUrl())//
                .modelName(aiModel.getModelName())//
                .temperature(aiModel.getTemperature())//
                .topP(aiModel.getTopP())//
                .maxCompletionTokens(aiModel.getResponseLimit())//
                .listeners(chatModelListenerList)//
                .timeout(Duration.ofSeconds(aiKnowledgeProperties.getConnectTimeout()))
                .logRequests(aiKnowledgeProperties.isShowLog())//
                .logResponses(aiKnowledgeProperties.isShowLog())//
                .build();

        return Pair.of(streamingChatLanguageModel,
                AiServices.builder(AiNoMemoryStreamAssistantService.class)
                        .streamingChatLanguageModel(streamingChatLanguageModel)
                        .build());
    }

    /**
     * 构建 AI Function Assistant
     *
     * @param aiModel AI 模型
     * @return {@link AiFunctionAssistantService }
     */
    @Override
    public Pair<StreamingChatLanguageModel, AiFunctionAssistantService> buildAiFunctionAssistant(AiModelEntity aiModel) {
        OpenAiStreamingChatModel streamingChatLanguageModel = OpenAiStreamingChatModel.builder()//
                .apiKey(aiModel.getApiKey())//
                .baseUrl(aiModel.getBaseUrl())//
                .modelName(aiModel.getModelName())//
                .temperature(aiModel.getTemperature())//
                .topP(aiModel.getTopP())//
                .maxCompletionTokens(aiModel.getResponseLimit())//
                .listeners(chatModelListenerList)//
                .timeout(Duration.ofSeconds(aiKnowledgeProperties.getConnectTimeout()))
                .logRequests(aiKnowledgeProperties.isShowLog())//
                .logResponses(aiKnowledgeProperties.isShowLog())//
                .build();

        return Pair.of(streamingChatLanguageModel,
                AiServices.builder(AiFunctionAssistantService.class)
                        .streamingChatLanguageModel(streamingChatLanguageModel)
                        .toolProvider(toolProvider)
                        .chatMemoryProvider(chatMemoryAdvisorProvider)
                        .build());
    }

    /**
     * 构建 AI JSONAdency
     *
     * @param aiModel AI 模型
     * @return {@link AiAssistantService }
     */
    @Override
    public Triple<ChatLanguageModel, AiAssistantService, String> buildAiJSONAssistant(
            AiModelEntity aiModel) {
        OpenAiChatModel.OpenAiChatModelBuilder builder = OpenAiChatModel.builder()//
                .apiKey(aiModel.getApiKey())//
                .baseUrl(aiModel.getBaseUrl())//
                .modelName(aiModel.getModelName())//
                .temperature(aiModel.getTemperature())//
                .topP(aiModel.getTopP())//
                .maxCompletionTokens(aiModel.getResponseLimit())//
                .listeners(chatModelListenerList)//
                .strictJsonSchema(true)//
                .timeout(Duration.ofSeconds(aiKnowledgeProperties.getConnectTimeout()))
                .logRequests(aiKnowledgeProperties.isShowLog())//
                .logResponses(aiKnowledgeProperties.isShowLog())//
                .maxRetries(aiKnowledgeProperties.getMaxRetry());

        String formatType = ModelProviderFormatEnums.getFormat(aiModel.getProvider());
        builder.responseFormat(formatType);

        OpenAiChatModel chatModel = builder.build();
        return Triple.of(chatModel,
                AiServices.builder(AiAssistantService.class)
                        .chatLanguageModel(chatModel)
                        .chatMemoryProvider(chatMemoryAdvisorProvider)
                        .build(),
                formatType);
    }

    /**
     * 构建嵌入模型
     *
     * @param model 模型
     * @return {@link Pair }<{@link String }, {@link DimensionAwareEmbeddingModel }>
     */
    @Override
    public DimensionAwareEmbeddingModel buildEmbeddingModel(AiModelEntity model) {
        return OpenAiEmbeddingModel.builder()
                .apiKey(model.getApiKey())//
                .baseUrl(model.getBaseUrl())//
                .maxRetries(aiKnowledgeProperties.getMaxRetry())//
                .timeout(Duration.ofSeconds(aiKnowledgeProperties.getConnectTimeout()))
                .modelName(model.getModelName())
                .build();
    }

    /**
     * 构建图像模型
     *
     * @param model 型
     * @return {@link ImageModel }
     */
    @Override
    public AiSiliconflowAssistantService builFileAssistant(AiModelEntity model) {
        JdkClientHttpRequestFactory jdkClientHttpRequestFactory = new JdkClientHttpRequestFactory();
        jdkClientHttpRequestFactory.setReadTimeout(Duration.ofSeconds(aiKnowledgeProperties.getConnectTimeout()));
        RestClient client = restClientBuilderOptional.orElseGet(RestClient::builder)
                .requestFactory(jdkClientHttpRequestFactory)
                .baseUrl(model.getBaseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, String.format("Bearer %s", model.getApiKey()))
                .build();

        HttpServiceProxyFactory factory = HttpServiceProxyFactory.builderFor(RestClientAdapter.create(client)).build();

        return factory.createClient(AiSiliconflowAssistantService.class);
    }

}
