package cn.joywon.poco.knowledge.support.provider;

import cn.hutool.core.lang.Pair;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.service.*;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import dev.langchain4j.model.image.ImageModel;
import org.apache.commons.lang3.tuple.Triple;

/**
 * 模型构建（抽象）处理器
 *
 * @author poco
 * @date 2024/09/29
 */
public interface ModelProvider {

	/**
	 * 是否支持模型类型
	 * @param aiModel 模型
	 * @return {@link Object}
	 */
	boolean support(AiModelEntity aiModel);

	/**
	 * 校验模型参数
	 * @param aiModel 模型
	 * @return {@link Object}
	 */
	default boolean checkParams(AiModelEntity aiModel) {
		return true;
	}

	/**
	 * 构建 Chat Assistant (同步调用)
	 * @param aiModel AI 模型
	 * @return {@link AiAssistantService }
	 */
	Pair<ChatLanguageModel, AiAssistantService> buildAiAssistant(AiModelEntity aiModel);

	/**
	 * 构建 AI JSONAdency
	 * @param aiModel AI 模型
	 * @return {@link AiAssistantService }
	 */
	Triple<ChatLanguageModel, AiAssistantService, String> buildAiJSONAssistant(AiModelEntity aiModel);

	/**
	 * 构建 AI Stream Assistant
	 * @param aiModel AI 模型
	 * @return {@link AiStreamAssistantService }
	 */
	Pair<StreamingChatLanguageModel, AiStreamAssistantService> buildAiStreamAssistant(AiModelEntity aiModel);

	/**
	 * 构建 AI Stream Assistant
	 *
	 * @param aiModel AI 模型
	 * @return {@link AiStreamAssistantService }
	 */
	Pair<StreamingChatLanguageModel, AiNoMemoryStreamAssistantService> buildAiNoMemoryStreamAssistant(AiModelEntity aiModel);


	/**
	 * 构建 AI Function Assistant
	 * @param aiModel AI 模型
	 * @return {@link AiFunctionAssistantService }
	 */
	Pair<StreamingChatLanguageModel, AiFunctionAssistantService> buildAiFunctionAssistant(AiModelEntity aiModel);

	/**
	 * 构建嵌入模型
	 * @param model 型
	 * @return {@link DimensionAwareEmbeddingModel }
	 */
	DimensionAwareEmbeddingModel buildEmbeddingModel(AiModelEntity model);

	/**
	 * 构建图像模型
	 * @param model 型
	 * @return {@link ImageModel }
	 */
	AiSiliconflowAssistantService builFileAssistant(AiModelEntity model);

	/**
	 * 获取 Image Assistant
	 * @param model 型
	 * @return {@link AiSiliconflowAssistantService }
	 */
	AiSiliconflowAssistantService getFileAssistant(String model);

	/**
	 * 获取 AI Assistant 服务
	 * @param modelName AI 模型
	 * @return {@link AiAssistantService }
	 */
	Pair<ChatLanguageModel, AiAssistantService> getAiAssistant(String modelName);

	/**
	 * 获取 AI Assistant
	 * @return {@link Pair }<{@link ChatLanguageModel }, {@link AiAssistantService }>
	 */
	Pair<ChatLanguageModel, AiAssistantService> getAiAssistant();

	/**
	 * 获取 AI Vision Assistant
	 * @return {@link Pair }<{@link ChatLanguageModel }, {@link AiAssistantService }>
	 */
	Pair<ChatLanguageModel, AiAssistantService> getAiVisionAssistant();

	/**
	 * 获取 AI Vision Stream Assistant
	 *
	 * @return {@link Pair }<{@link StreamingChatLanguageModel }, {@link AiStreamAssistantService }>
	 */
	Pair<StreamingChatLanguageModel, AiStreamAssistantService> getAiVisionStreamAssistant();

	/**
	 * 获取 AI JSONAcassist
	 * @param modelName 型号名称
	 * @return {@link Triple }<{@link ChatLanguageModel }, {@link AiAssistantService
	 * },{@link String }>
	 */
	Triple<ChatLanguageModel, AiAssistantService, String> getAiJSONAssistant(String modelName);

	/**
	 * 获取 AI Stream Assistant
	 * @param modelName AI 模型
	 * @return {@link AiStreamAssistantService }
	 */
	Pair<StreamingChatLanguageModel, AiStreamAssistantService> getAiStreamAssistant(String modelName);


	/**
	 * 获取 AI Stream Assistant
	 *
	 * @param modelName AI 模型
	 * @return {@link AiStreamAssistantService }
	 */
	Pair<StreamingChatLanguageModel, AiNoMemoryStreamAssistantService> getAiNoMemoryStreamAssistant(String modelName);

	/**
	 * 获取 AI Function Assistant
	 * @param modelName AI 模型
	 * @return {@link AiFunctionAssistantService }
	 */
	Pair<StreamingChatLanguageModel, AiFunctionAssistantService> getAiFunctionAssistant(String modelName);

	/**
	 * 获取嵌入模型
	 * @param modelId 型
	 * @return {@link DimensionAwareEmbeddingModel }
	 */
	DimensionAwareEmbeddingModel getEmbeddingModel(String modelId);

	/**
	 * 删除删除模型
	 * @param modelName 型号名称
	 */
	void delete(String modelName);

}
