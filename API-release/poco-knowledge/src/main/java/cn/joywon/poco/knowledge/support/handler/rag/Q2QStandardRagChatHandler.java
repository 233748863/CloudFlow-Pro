package cn.joywon.poco.knowledge.support.handler.rag;

import cn.hutool.core.collection.CollUtil;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.service.EmbeddingStoreService;
import cn.joywon.poco.knowledge.support.constant.DocumentTypeEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.List;

import static dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey;

/**
 * 通过问题匹配标注数据, 只有超过 90% 相识的问题才会返回
 *
 * @author poco
 * @date 2024/7/4
 */
@Service
public class Q2QStandardRagChatHandler extends AbstractRagChatHandler {

	private final EmbeddingStoreService embeddingStoreService;

	public Q2QStandardRagChatHandler(ModelProvider modelProvider, EmbeddingStoreService embeddingStoreService) {
		super(modelProvider);
		this.embeddingStoreService = embeddingStoreService;
	}

	public Flux<AiMessageResultDTO> process(Embedding embeddedList, AiDatasetEntity dataset,
			ChatMessageDTO chatMessageDTO) {
		EmbeddingSearchRequest embeddingSearchRequest = EmbeddingSearchRequest.builder()
			.queryEmbedding(embeddedList)
			.maxResults(dataset.getTopK())
			.minScore(0.9)
			.filter(metadataKey(AiDocumentEntity.Fields.datasetId).isEqualTo(dataset.getId().toString())
				.and(metadataKey(DocumentTypeEnums.Fields.type).isEqualTo(DocumentTypeEnums.QUESTION.getType())))
			.build();

		EmbeddingSearchResult<TextSegment> searchResult = embeddingStoreService
			.embeddingStore(dataset.getCollectionName())
			.search(embeddingSearchRequest);
		List<EmbeddingMatch<TextSegment>> embeddingMatchList = searchResult.matches();

		if (CollUtil.isNotEmpty(embeddingMatchList)) {
			List<String> answerTextList = embeddingMatchList.stream()
				.map(textSegmentEmbeddingMatch -> textSegmentEmbeddingMatch.embedded()
					.metadata()
					.getString(AiChatRecordEntity.Fields.answerText))
				.toList();
			return Flux.just(new AiMessageResultDTO(answerTextList.get(0)));
		}
		return Flux.empty();
	}

}
