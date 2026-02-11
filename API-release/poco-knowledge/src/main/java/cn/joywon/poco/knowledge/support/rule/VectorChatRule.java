package cn.joywon.poco.knowledge.support.rule;

import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.service.AiDatasetService;
import cn.joywon.poco.knowledge.support.handler.rag.Q2AVectorRagChatHandler;
import cn.joywon.poco.knowledge.support.handler.rag.Q2QStandardRagChatHandler;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

/**
 * 基于知识库的聊天
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("vectorChat")
@RequiredArgsConstructor
public class VectorChatRule implements ChatRule {

	private final AiDatasetService aiDatasetService;

	private final ModelProvider modelProvider;

	/**
	 * 问题匹配
	 */
	private final Q2QStandardRagChatHandler q2QStandardRagChatHandler;

	/**
	 * 答案匹配
	 */
	private final Q2AVectorRagChatHandler q2AVectorRagChatHandler;

	@Override
	public Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {
		AiDatasetEntity dataset = aiDatasetService.getById(chatMessageDTO.getDatasetId());
		DimensionAwareEmbeddingModel embeddingModel = modelProvider.getEmbeddingModel(dataset.getEmbeddingModel());
		Embedding queryEmbedding = embeddingModel.embed(chatMessageDTO.getContent()).content();

		// 使用标注数据处理结果
		if (YesNoEnum.YES.getCode().equals(dataset.getStandardFlag())) {
			Flux<AiMessageResultDTO> q2qFluxResult = q2QStandardRagChatHandler
				.process(queryEmbedding, dataset, chatMessageDTO)
				.cache();
			// 如果 q2qFluxResult 不是 empty 则直接返回，如果是 empty 则继续执行 q2AVectorRagChatHandler
			return q2qFluxResult
				.switchIfEmpty(q2AVectorRagChatHandler.process(queryEmbedding, dataset, chatMessageDTO));
		}

		return q2AVectorRagChatHandler.process(queryEmbedding, dataset, chatMessageDTO);
	}

}
