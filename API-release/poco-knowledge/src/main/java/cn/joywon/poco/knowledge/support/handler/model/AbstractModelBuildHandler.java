package cn.joywon.poco.knowledge.support.handler.model;

import cn.hutool.cache.Cache;
import cn.hutool.cache.CacheUtil;
import cn.hutool.core.lang.Pair;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.spring.SpringUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.config.properties.DefaultModelProperties;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.service.*;
import cn.joywon.poco.knowledge.support.constant.ModelSupportEnums;
import cn.joywon.poco.knowledge.support.constant.ModelTypeEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.tuple.Triple;

import java.util.Objects;

/**
 * 抽象模型构建处理程序
 *
 * @author poco
 * @date 2024/09/29
 */
@Slf4j
public abstract class AbstractModelBuildHandler implements ModelProvider {

    /**
     * AI Assistant 服务缓存
     */
    final static Cache<String, Pair<ChatLanguageModel, AiAssistantService>> AI_ASSISTANT_SERVICE_CACHE = CacheUtil
            .newLRUCache(1024);

    /**
     * AI JSON Assistant 服务缓存
     */
    final static Cache<String, Triple<ChatLanguageModel, AiAssistantService, String>> AI_JSON_ASSISTANT_SERVICE_CACHE = CacheUtil
            .newLRUCache(1024);

    /**
     * AI 流助手服务缓存
     */
    final static Cache<String, Pair<StreamingChatLanguageModel, AiStreamAssistantService>> AI_STREAM_ASSISTANT_SERVICE_CACHE = CacheUtil
            .newLRUCache(1024);

    final static Cache<String, Pair<StreamingChatLanguageModel, AiNoMemoryStreamAssistantService>> AI_NOMEMORY_STREAM_ASSISTANT_SERVICE_CACHE = CacheUtil
            .newLRUCache(1024);


    /**
     * AI 函数助手服务缓存
     */
    final static Cache<String, Pair<StreamingChatLanguageModel, AiFunctionAssistantService>> AI_FUNCTION_ASSISTANT_SERVICE_CACHE = CacheUtil
            .newLRUCache(1024);

    /**
     * AI 嵌入缓存
     */
    final static Cache<String, DimensionAwareEmbeddingModel> AI_EMBEDDING_CACHE = CacheUtil.newLRUCache(1024);

    /**
     * AI 图像缓存
     */
    final static Cache<String, AiSiliconflowAssistantService> AI_IMAGE_CACHE = CacheUtil.newLRUCache(1024);

    /**
     * 删除模型
     *
     * @param modelName 型号名称
     */
    @Override
    public void delete(String modelName) {
        AI_ASSISTANT_SERVICE_CACHE.remove(modelName);
        AI_JSON_ASSISTANT_SERVICE_CACHE.remove(modelName);
        AI_STREAM_ASSISTANT_SERVICE_CACHE.remove(modelName);
        AI_FUNCTION_ASSISTANT_SERVICE_CACHE.remove(modelName);
        AI_EMBEDDING_CACHE.remove(modelName);
        AI_IMAGE_CACHE.remove(modelName);
    }

    /**
     * 获取 AI Assistant 服务
     *
     * @param modelName AI 模型
     * @return {@link AiAssistantService }
     */
    @Override
    public Pair<ChatLanguageModel, AiAssistantService> getAiAssistant(String modelName) {
        if (StrUtil.isBlank(modelName)) {
            modelName = ModelSupportEnums.GLM_4V_FLASH.name();
        }

        Pair<ChatLanguageModel, AiAssistantService> aiAssistantServicePair = AI_ASSISTANT_SERVICE_CACHE.get(modelName);

        if (Objects.nonNull(aiAssistantServicePair)) {
            return aiAssistantServicePair;
        }

        aiAssistantServicePair = buildAiAssistant(getModelByName(modelName, ModelTypeEnums.CHAT));
        AI_ASSISTANT_SERVICE_CACHE.put(modelName, aiAssistantServicePair);
        return aiAssistantServicePair;
    }

    /**
     * 获取 AI Stream Assistant
     *
     * @param modelName AI 模型
     * @return {@link AiStreamAssistantService }
     */
    @Override
    public Pair<StreamingChatLanguageModel, AiStreamAssistantService> getAiStreamAssistant(String modelName) {
        Pair<StreamingChatLanguageModel, AiStreamAssistantService> aiStreamAssistantServicePair = AI_STREAM_ASSISTANT_SERVICE_CACHE
                .get(modelName);

        if (Objects.nonNull(aiStreamAssistantServicePair)) {
            return aiStreamAssistantServicePair;
        }

        aiStreamAssistantServicePair = buildAiStreamAssistant(getModelByName(modelName, ModelTypeEnums.CHAT));
        AI_STREAM_ASSISTANT_SERVICE_CACHE.put(modelName, aiStreamAssistantServicePair);
        return aiStreamAssistantServicePair;
    }

    /**
     * 获取 AI Function Assistant
     *
     * @param modelName AI 模型
     * @return {@link AiFunctionAssistantService }
     */
    @Override
    public Pair<StreamingChatLanguageModel, AiFunctionAssistantService> getAiFunctionAssistant(String modelName) {
        Pair<StreamingChatLanguageModel, AiFunctionAssistantService> aiFunctionAssistantServicePair = AI_FUNCTION_ASSISTANT_SERVICE_CACHE
                .get(modelName);

        if (Objects.nonNull(aiFunctionAssistantServicePair)) {
            return aiFunctionAssistantServicePair;
        }

        aiFunctionAssistantServicePair = buildAiFunctionAssistant(getModelByName(modelName, ModelTypeEnums.CHAT));
        AI_FUNCTION_ASSISTANT_SERVICE_CACHE.put(modelName, aiFunctionAssistantServicePair);
        return aiFunctionAssistantServicePair;
    }

    /**
     * 获取嵌入模型
     *
     * @param modelName 型
     * @return {@link DimensionAwareEmbeddingModel }
     */
    @Override
    public DimensionAwareEmbeddingModel getEmbeddingModel(String modelName) {

        DimensionAwareEmbeddingModel embeddingModel = AI_EMBEDDING_CACHE.get(modelName);

        if (Objects.nonNull(embeddingModel)) {
            return embeddingModel;
        }

        embeddingModel = buildEmbeddingModel(getModelByName(modelName, ModelTypeEnums.EMBEDDING));
        AI_EMBEDDING_CACHE.put(modelName, embeddingModel);
        return embeddingModel;
    }

    /**
     * 获取 AI JSON Assistant 服务
     *
     * @param modelName@return {@link AiAssistantService }
     */
    @Override
    public Triple<ChatLanguageModel, AiAssistantService, String> getAiJSONAssistant(String modelName) {

        Triple<ChatLanguageModel, AiAssistantService, String> aiAssistantServicePair = null;
        if (StrUtil.isNotBlank(modelName)) {
            aiAssistantServicePair = AI_JSON_ASSISTANT_SERVICE_CACHE
                    .get(modelName);

            if (Objects.nonNull(aiAssistantServicePair)) {
                return aiAssistantServicePair;
            }
        }

        aiAssistantServicePair = buildAiJSONAssistant(getModelByName(modelName, ModelTypeEnums.CHAT));
        AI_JSON_ASSISTANT_SERVICE_CACHE.put(modelName, aiAssistantServicePair);
        return aiAssistantServicePair;
    }

    /**
     * 获取 Image Assistant
     *
     * @param modelName 型
     * @return {@link AiSiliconflowAssistantService }
     */
    @Override
    public AiSiliconflowAssistantService getFileAssistant(String modelName) {
        AiSiliconflowAssistantService imageModel = AI_IMAGE_CACHE.get(modelName);

        if (Objects.nonNull(imageModel)) {
            return imageModel;
        }

        imageModel = builFileAssistant(getModelByName(modelName, ModelTypeEnums.IMAGE));
        AI_IMAGE_CACHE.put(modelName, imageModel);
        return imageModel;
    }

    /**
     * 获取默认的 AI Assistant
     *
     * @return {@link Pair }<{@link ChatLanguageModel }, {@link AiAssistantService }>
     */
    @Override
    public Pair<ChatLanguageModel, AiAssistantService> getAiAssistant() {
        AiModelMapper modelMapper = SpringUtil.getBean(AiModelMapper.class);
        AiModelEntity aiModelEntity = modelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
                .eq(AiModelEntity::getDefaultModel, YesNoEnum.YES.getCode())
                .eq(AiModelEntity::getModelType, ModelTypeEnums.CHAT.getType()), false);
        if (Objects.isNull(aiModelEntity)) {
            log.error("默认模型不存在:{}，请先在模型配置中添加", ModelTypeEnums.CHAT.getType());
            throw new CheckedException("模型不存在");
        }

        return getAiAssistant(aiModelEntity.getName());
    }

    /**
     * 获取 AI Vision Assistant
     *
     * @return {@link Pair }<{@link ChatLanguageModel }, {@link AiAssistantService }>
     */
    @Override
    public Pair<ChatLanguageModel, AiAssistantService> getAiVisionAssistant() {
        AiModelMapper modelMapper = SpringUtil.getBean(AiModelMapper.class);
        AiModelEntity aiModelEntity = modelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
                .eq(AiModelEntity::getDefaultModel, YesNoEnum.YES.getCode())
                .eq(AiModelEntity::getModelType, ModelTypeEnums.VISION.getType()), false);
        if (Objects.isNull(aiModelEntity)) {
            // 默认使用系统内置模型
            return getAiAssistant(null);
        }

        return getAiAssistant(aiModelEntity.getName());
    }

    /**
     * 获取 AI Vision Stream Assistant
     *
     * @return {@link Pair }<{@link StreamingChatLanguageModel }, {@link AiAssistantService }>
     */
    @Override
    public Pair<StreamingChatLanguageModel, AiStreamAssistantService> getAiVisionStreamAssistant() {
        AiModelMapper modelMapper = SpringUtil.getBean(AiModelMapper.class);
        AiModelEntity aiModelEntity = modelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
                .eq(AiModelEntity::getDefaultModel, YesNoEnum.YES.getCode())
                .eq(AiModelEntity::getModelType, ModelTypeEnums.VISION.getType()), false);
        if (Objects.isNull(aiModelEntity)) {
            // 默认使用系统内置模型
            return getAiStreamAssistant(ModelSupportEnums.GLM_4V_FLASH.name());
        }

        return getAiStreamAssistant(aiModelEntity.getName());
    }

    /**
     * 按名称获取模型
     *
     * @param modelName 型号名称
     * @return {@link AiModelEntity }
     */
    public AiModelEntity getModelByName(String modelName, ModelTypeEnums modelTypeEnum) {
        AiModelMapper modelMapper = SpringUtil.getBean(AiModelMapper.class);

        AiModelEntity aiModelEntity;
        if (StrUtil.isNotBlank(modelName)) {
            aiModelEntity = modelMapper
                    .selectOne(Wrappers.<AiModelEntity>lambdaQuery().eq(AiModelEntity::getName, modelName), false);
        } else {
            aiModelEntity = modelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
                    .eq(AiModelEntity::getModelType, modelTypeEnum.getType())
                    .eq(AiModelEntity::getDefaultModel, YesNoEnum.YES.getCode()), false);
        }

        if (Objects.isNull(aiModelEntity)) {
            log.error("模型不存在:{}，请先在模型配置中添加，默认使用系统内置模型", modelName);
            AiModelEntity defaultModel = new AiModelEntity();
            AiKnowledgeProperties aiKnowledgeProperties = SpringUtil.getBean(AiKnowledgeProperties.class);
            DefaultModelProperties modelProperties = aiKnowledgeProperties.getDefaultModel();
            defaultModel.setName(modelProperties.getModel().getCode());
            defaultModel.setApiKey(modelProperties.getApiKey());
            defaultModel.setBaseUrl(modelProperties.getBaseUrl());
            defaultModel.setModelName(modelProperties.getModel().getCode());
            return defaultModel;
        }
        return aiModelEntity;
    }

    /**
     * 获取 AI Stream Assistant
     *
     * @param modelName AI 模型
     * @return {@link AiStreamAssistantService }
     */
    @Override
    public Pair<StreamingChatLanguageModel, AiNoMemoryStreamAssistantService> getAiNoMemoryStreamAssistant(String modelName) {
        Pair<StreamingChatLanguageModel, AiNoMemoryStreamAssistantService> aiStreamAssistantServicePair = AI_NOMEMORY_STREAM_ASSISTANT_SERVICE_CACHE
                .get(modelName);

        if (Objects.nonNull(aiStreamAssistantServicePair)) {
            return aiStreamAssistantServicePair;
        }

        aiStreamAssistantServicePair = buildAiNoMemoryStreamAssistant(getModelByName(modelName, ModelTypeEnums.CHAT));
        AI_NOMEMORY_STREAM_ASSISTANT_SERVICE_CACHE.put(modelName, aiStreamAssistantServicePair);
        return aiStreamAssistantServicePair;
    }
}
